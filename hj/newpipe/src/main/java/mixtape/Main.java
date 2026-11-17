package mixtape;

import com.google.gson.Gson;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import okhttp3.Request;
import okhttp3.Response;
import org.schabi.newpipe.extractor.NewPipe;
import org.schabi.newpipe.extractor.ServiceList;
import org.schabi.newpipe.extractor.InfoItem;
import org.schabi.newpipe.extractor.MediaFormat;
import org.schabi.newpipe.extractor.localization.ContentCountry;
import org.schabi.newpipe.extractor.localization.Localization;
import org.schabi.newpipe.extractor.search.SearchInfo;
import org.schabi.newpipe.extractor.services.youtube.linkHandler.YoutubeSearchQueryHandlerFactory;
import org.schabi.newpipe.extractor.stream.AudioStream;
import org.schabi.newpipe.extractor.stream.DeliveryMethod;
import org.schabi.newpipe.extractor.stream.StreamInfo;
import org.schabi.newpipe.extractor.stream.StreamInfoItem;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;

/**
 * Tiny HTTP wrapper around NewPipeExtractor for the MixTape Flask app.
 *
 *   GET /health
 *   GET /info?id=VIDEO_ID&fmt=opus|aac&quality=high|medium|low   -> JSON metadata
 *   GET /audio?id=VIDEO_ID&fmt=...&quality=...                    -> audio bytes (Range supported)
 *   GET /search?q=QUERY&n=10                                      -> JSON songs
 *
 * googlevideo URLs are bound to the IP that resolved them, so /audio resolves AND
 * fetches from this service; the Flask app only talks to this service.
 * Set NEWPIPE_API_KEY to require an "X-Api-Key" header on every call except /health.
 */
public final class Main {
    static final Gson GSON = new Gson();
    static final HttpDownloader DL = new HttpDownloader();
    static final String API_KEY = System.getenv("NEWPIPE_API_KEY");
    static final long TTL_MS = 20 * 60 * 1000L;

    record Cached(long at, StreamInfo info) {}
    static final Map<String, Cached> CACHE = new ConcurrentHashMap<>();

    public static void main(String[] args) throws Exception {
        String cc = Optional.ofNullable(System.getenv("YTM_LOCATION")).orElse("IN");
        NewPipe.init(DL, new Localization("en", cc), new ContentCountry(cc));

        int port = Integer.parseInt(Optional.ofNullable(System.getenv("PORT")).orElse("8080"));
        HttpServer server = HttpServer.create(new InetSocketAddress(port), 0);
        server.setExecutor(Executors.newFixedThreadPool(16));
        server.createContext("/health", ex -> json(ex, 200, Map.of("ok", true)));
        server.createContext("/info", guarded(Main::info));
        server.createContext("/audio", guarded(Main::audio));
        server.createContext("/search", guarded(Main::search));
        server.start();
        System.out.println("newpipe service on :" + port);
    }

    interface Handler { void handle(HttpExchange ex, Map<String, String> q) throws Exception; }

    static com.sun.net.httpserver.HttpHandler guarded(Handler h) {
        return ex -> {
            try {
                if (API_KEY != null && !API_KEY.isEmpty()
                        && !API_KEY.equals(ex.getRequestHeaders().getFirst("X-Api-Key"))) {
                    json(ex, 401, Map.of("error", "unauthorized"));
                    return;
                }
                h.handle(ex, query(ex));
            } catch (Throwable t) {
                try { json(ex, 500, Map.of("error", String.valueOf(t.getMessage()))); } catch (Throwable ignored) {}
            } finally {
                ex.close();
            }
        };
    }

    // ---- stream resolving ------------------------------------------------

    static StreamInfo resolve(String id) throws Exception {
        Cached c = CACHE.get(id);
        if (c != null && System.currentTimeMillis() - c.at < TTL_MS) return c.info;
        StreamInfo si = StreamInfo.getInfo(ServiceList.YouTube, "https://www.youtube.com/watch?v=" + id);
        CACHE.put(id, new Cached(System.currentTimeMillis(), si));
        return si;
    }

    static AudioStream pick(StreamInfo si, String fmt, String quality) {
        List<AudioStream> all = new ArrayList<>();
        for (AudioStream a : si.getAudioStreams()) {
            if (a.getDeliveryMethod() == DeliveryMethod.PROGRESSIVE_HTTP && a.getContent() != null) all.add(a);
        }
        if (all.isEmpty()) throw new IllegalStateException("No progressive audio stream available");

        boolean wantOpus = !"aac".equals(fmt);
        List<AudioStream> pool = new ArrayList<>();
        for (AudioStream a : all) {
            MediaFormat f = a.getFormat();
            boolean opus = f == MediaFormat.WEBMA_OPUS || f == MediaFormat.WEBMA;
            boolean m4a = f == MediaFormat.M4A;
            if (wantOpus ? opus : m4a) pool.add(a);
        }
        if (pool.isEmpty()) pool = all;
        pool.sort(Comparator.comparingInt(a -> a.getAverageBitrate()));

        switch (quality == null ? "high" : quality) {
            case "low": return pool.get(0);
            case "medium": {
                AudioStream best = pool.get(0);
                for (AudioStream a : pool) if (a.getAverageBitrate() <= 135) best = a;
                return best;
            }
            default: return pool.get(pool.size() - 1);
        }
    }

    static String codecLabel(AudioStream a) {
        MediaFormat f = a.getFormat();
        String name = (f == MediaFormat.M4A) ? "AAC" : (f != null && f.name().contains("OPUS") || f == MediaFormat.WEBMA) ? "Opus" : "Audio";
        int br = a.getAverageBitrate();
        return name + " \u2022 " + name.toUpperCase() + (br > 0 ? " " + br + " kbps" : "");
    }

    static void info(HttpExchange ex, Map<String, String> q) throws Exception {
        String id = need(q, "id");
        StreamInfo si = resolve(id);
        AudioStream a = pick(si, q.get("fmt"), q.get("quality"));
        String thumb = "";
        if (si.getThumbnails() != null && !si.getThumbnails().isEmpty()) {
            thumb = si.getThumbnails().get(si.getThumbnails().size() - 1).getUrl();
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", id);
        out.put("title", si.getName());
        out.put("uploader", si.getUploaderName() == null ? "" : si.getUploaderName().replace(" - Topic", ""));
        out.put("duration", si.getDuration());
        out.put("thumbnail", thumb);
        out.put("abr", a.getAverageBitrate());
        out.put("ext", a.getFormat() == null ? "" : a.getFormat().getSuffix());
        out.put("codec", codecLabel(a));
        json(ex, 200, out);
    }

    static void audio(HttpExchange ex, Map<String, String> q) throws Exception {
        String id = need(q, "id");
        StreamInfo si = resolve(id);
        AudioStream a = pick(si, q.get("fmt"), q.get("quality"));

        Request.Builder rb = new Request.Builder().url(a.getContent())
                .header("User-Agent", HttpDownloader.USER_AGENT);
        String range = ex.getRequestHeaders().getFirst("Range");
        if (range != null) rb.header("Range", range);

        try (Response up = DL.client.newCall(rb.build()).execute()) {
            if (up.code() >= 400) {
                CACHE.remove(id); // stale URL: re-resolve next time
                json(ex, 502, Map.of("error", "upstream " + up.code()));
                return;
            }
            String ct = up.header("Content-Type", "audio/webm");
            ex.getResponseHeaders().set("Content-Type", ct);
            for (String h : new String[]{"Content-Range", "Accept-Ranges"}) {
                if (up.header(h) != null) ex.getResponseHeaders().set(h, up.header(h));
            }
            long len = up.body() != null ? up.body().contentLength() : -1;
            ex.sendResponseHeaders(up.code(), len >= 0 ? len : 0); // 0 = chunked
            try (InputStream in = up.body().byteStream(); OutputStream out = ex.getResponseBody()) {
                byte[] buf = new byte[65536];
                int n;
                while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            } catch (IOException clientGone) {
                // browser seeked / closed the connection
            }
        }
    }

    static void search(HttpExchange ex, Map<String, String> q) throws Exception {
        String query = need(q, "q");
        int n = Math.min(Math.max(Integer.parseInt(q.getOrDefault("n", "10")), 1), 25);
        var handler = ServiceList.YouTube.getSearchQHFactory()
                .fromQuery(query, List.of(YoutubeSearchQueryHandlerFactory.MUSIC_SONGS), "");
        SearchInfo res = SearchInfo.getInfo(ServiceList.YouTube, handler);

        List<Map<String, Object>> tracks = new ArrayList<>();
        for (InfoItem it : res.getRelatedItems()) {
            if (!(it instanceof StreamInfoItem s) || tracks.size() >= n) continue;
            String url = s.getUrl();
            int i = url.indexOf("v=");
            String vid = i >= 0 ? url.substring(i + 2).split("&")[0] : url;
            String thumb = (s.getThumbnails() == null || s.getThumbnails().isEmpty()) ? ""
                    : s.getThumbnails().get(s.getThumbnails().size() - 1).getUrl();
            Map<String, Object> t = new LinkedHashMap<>();
            t.put("id", vid);
            t.put("title", s.getName());
            t.put("uploader", s.getUploaderName() == null ? "" : s.getUploaderName());
            t.put("duration", s.getDuration());
            t.put("thumbnail", thumb);
            t.put("url", "https://www.youtube.com/watch?v=" + vid);
            tracks.add(t);
        }
        json(ex, 200, Map.of("tracks", tracks));
    }

    // ---- helpers ---------------------------------------------------------

    static String need(Map<String, String> q, String k) {
        String v = q.get(k);
        if (v == null || v.isBlank()) throw new IllegalArgumentException("missing '" + k + "'");
        return v.trim();
    }

    static Map<String, String> query(HttpExchange ex) {
        Map<String, String> m = new HashMap<>();
        String raw = ex.getRequestURI().getRawQuery();
        if (raw == null) return m;
        for (String p : raw.split("&")) {
            int i = p.indexOf('=');
            String k = URLDecoder.decode(i < 0 ? p : p.substring(0, i), StandardCharsets.UTF_8);
            String v = i < 0 ? "" : URLDecoder.decode(p.substring(i + 1), StandardCharsets.UTF_8);
            m.put(k, v);
        }
        return m;
    }

    static void json(HttpExchange ex, int code, Object body) throws IOException {
        byte[] b = GSON.toJson(body).getBytes(StandardCharsets.UTF_8);
        ex.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
        ex.sendResponseHeaders(code, b.length);
        try (OutputStream o = ex.getResponseBody()) { o.write(b); }
    }
}
