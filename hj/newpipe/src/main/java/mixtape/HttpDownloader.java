package mixtape;

import okhttp3.OkHttpClient;
import okhttp3.RequestBody;
import okhttp3.ResponseBody;
import org.schabi.newpipe.extractor.downloader.Downloader;
import org.schabi.newpipe.extractor.downloader.Request;
import org.schabi.newpipe.extractor.downloader.Response;
import org.schabi.newpipe.extractor.exceptions.ReCaptchaException;

import java.io.IOException;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;

/** Minimal OkHttp-backed Downloader, as required by NewPipeExtractor. */
public final class HttpDownloader extends Downloader {
    static final String USER_AGENT =
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0";

    final OkHttpClient client = new OkHttpClient.Builder()
            .readTimeout(30, TimeUnit.SECONDS)
            .connectTimeout(15, TimeUnit.SECONDS)
            .build();

    @Override
    public Response execute(Request request) throws IOException, ReCaptchaException {
        byte[] data = request.dataToSend();
        RequestBody body = data != null ? RequestBody.create(data) : null;
        String method = request.httpMethod();
        if (body == null && ("POST".equals(method) || "PUT".equals(method))) {
            body = RequestBody.create(new byte[0]);
        }

        okhttp3.Request.Builder b = new okhttp3.Request.Builder()
                .method(method, body)
                .url(request.url())
                .addHeader("User-Agent", USER_AGENT);

        for (Map.Entry<String, List<String>> e : request.headers().entrySet()) {
            b.removeHeader(e.getKey());
            for (String v : e.getValue()) b.addHeader(e.getKey(), v);
        }

        try (okhttp3.Response res = client.newCall(b.build()).execute()) {
            if (res.code() == 429) throw new ReCaptchaException("reCaptcha challenge requested", request.url());
            ResponseBody rb = res.body();
            String text = rb != null ? rb.string() : null;
            return new Response(res.code(), res.message(), res.headers().toMultimap(), text, res.request().url().toString());
        }
    }
}
