import Script from 'next/script';

export default function Home() {
  const v = process.env.ASSET_V || 'dev';
  return (
    <>
      <link rel="stylesheet" href="https://fonts.cdnfonts.com/css/sf-pro-display" />
      <link rel="stylesheet" href={`/style.css?v=${v}`} />
      <link rel="stylesheet" href={`/amlyrics.css?v=${v}`} />

      <svg aria-hidden="true" style={{position:'absolute',width:0,height:0,overflow:'hidden'}} dangerouslySetInnerHTML={{__html: `<defs>
  <filter id="refract-lens" x="-15%" y="-15%" width="130%" height="130%" color-interpolation-filters="sRGB">
    <feImage href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cdefs%3E%3CradialGradient id='g' cx='50%25' cy='50%25' r='50%25'%3E%3Cstop offset='0%25' stop-color='rgb(128,128,128)'/%3E%3Cstop offset='58%25' stop-color='rgb(128,128,128)'/%3E%3Cstop offset='82%25' stop-color='rgb(205,78,128)'/%3E%3Cstop offset='100%25' stop-color='rgb(255,20,128)'/%3E%3C/radialGradient%3E%3C/defs%3E%3Crect width='200' height='200' rx='100' fill='url(%23g)'/%3E%3C/svg%3E" result="dispMap" preserveAspectRatio="none"/>
    <feDisplacementMap in="SourceGraphic" in2="dispMap" scale="22" xChannelSelector="R" yChannelSelector="G" result="warped"/>
    <feOffset in="warped" dx="-1.2" dy="0" result="rOff"/>
    <feOffset in="warped" dx="1.2" dy="0" result="bOff"/>
    <feColorMatrix in="rOff" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="rChan"/>
    <feColorMatrix in="warped" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="gChan"/>
    <feColorMatrix in="bOff" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="bChan"/>
    <feBlend in="rChan" in2="gChan" mode="screen" result="rg"/>
    <feBlend in="rg" in2="bChan" mode="screen" result="rgb"/>
    <feGaussianBlur in="rgb" stdDeviation="1.4" result="softRefract"/>
  </filter>
  <filter id="refract-pill" x="-10%" y="-10%" width="120%" height="120%" color-interpolation-filters="sRGB">
    <feImage href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='100' preserveAspectRatio='none'%3E%3Cdefs%3E%3CradialGradient id='p' cx='50%25' cy='50%25' r='50%25'%3E%3Cstop offset='0%25' stop-color='rgb(128,128,128)'/%3E%3Cstop offset='68%25' stop-color='rgb(128,128,128)'/%3E%3Cstop offset='89%25' stop-color='rgb(190,75,128)'/%3E%3Cstop offset='100%25' stop-color='rgb(250,25,128)'/%3E%3C/radialGradient%3E%3C/defs%3E%3Crect width='300' height='100' rx='50' fill='url(%23p)'/%3E%3C/svg%3E" result="pillMap" preserveAspectRatio="none"/>
    <feDisplacementMap in="SourceGraphic" in2="pillMap" scale="16" xChannelSelector="R" yChannelSelector="G" result="warpedPill"/>
    <feGaussianBlur in="warpedPill" stdDeviation="5" result="blurredPill"/>
  </filter>
  <symbol id="i-search" viewBox="0 0 24 24"><path d="M15.5 14h-.79l-.28-.27A6.47 6.47 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></symbol>
  <symbol id="i-person" viewBox="0 0 24 24"><path d="M12 12a4 4 0 100-8 4 4 0 000 8zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></symbol>
  <symbol id="i-play" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></symbol>
  <symbol id="i-pause" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></symbol>
  <symbol id="i-next" viewBox="0 0 24 24"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></symbol>
  <symbol id="i-prev" viewBox="0 0 24 24"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></symbol>
  <symbol id="i-heart" viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></symbol>
  <symbol id="i-shuffle" viewBox="0 0 24 24"><path d="M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z"/></symbol>
  <symbol id="i-repeat" viewBox="0 0 24 24"><path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"/></symbol>
  <symbol id="i-volume" viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0014 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/></symbol>
  <symbol id="i-down" viewBox="0 0 24 24"><path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z"/></symbol>
  <symbol id="i-home" viewBox="0 0 24 24"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></symbol>
  <symbol id="i-bars" viewBox="0 0 24 24"><path d="M5 9.2h3V19H5zM10.6 5h2.8v14h-2.8zm5.6 8H19v6h-2.8z"/></symbol>
  <symbol id="i-lib" viewBox="0 0 24 24"><path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-1 9h-4v4a2 2 0 11-2-2c.37 0 .7.1 1 .27V6h5v5z"/></symbol>
  <symbol id="i-queue" viewBox="0 0 24 24"><path d="M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2zM17 6v8.18c-.31-.11-.65-.18-1-.18-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3V8h3V6h-5z"/></symbol>
  <symbol id="i-close" viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></symbol>
  <symbol id="i-plus" viewBox="0 0 24 24"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></symbol>
  <symbol id="i-more" viewBox="0 0 24 24"><path d="M12 8a2 2 0 100-4 2 2 0 000 4zm0 2a2 2 0 100 4 2 2 0 000-4zm0 6a2 2 0 100 4 2 2 0 000-4z"/></symbol>
  <symbol id="i-mic" viewBox="0 0 24 24"><path d="M6 17h3l2-4V7H5v6h3l-2 4zm8 0h3l2-4V7h-6v6h3l-2 4z"/></symbol>
  <symbol id="i-back" viewBox="0 0 24 24"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></symbol>
  <symbol id="i-share" viewBox="0 0 24 24"><path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z"/></symbol>
  <symbol id="i-grip" viewBox="0 0 24 24"><path d="M3 15h18v-2H3v2zm0 4h18v-2H3v2zm0-8h18V9H3v2zm0-6v2h18V5H3z"/></symbol>
  <symbol id="i-playnext" viewBox="0 0 24 24"><path d="M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6z"/></symbol>
  <symbol id="i-plist" viewBox="0 0 24 24"><path d="M14 10H3v2h11v-2zm0-4H3v2h11V6zM3 16h7v-2H3v2zm11-1v3h-3v2h3v3h2v-3h3v-2h-3v-3h-2z"/></symbol>
  <symbol id="i-trash" viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></symbol>
  <symbol id="i-edit" viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 000-1.41l-2.34-2.34a1 1 0 00-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></symbol>
  <symbol id="i-chev" viewBox="0 0 24 24"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></symbol>
</defs>`}} />

      <div className="yt-host" id="yt-host" aria-hidden="true"></div>

      <div className="ambient" id="ambient"><i className="b b1"></i><i className="b b2"></i><i className="b b3"></i></div>
      <div className="app" id="app">
        <header className="topbar glass" id="topbar">
          <div className="tb-left">
            <button className="cbtn glass hidden" id="back-btn" title="Back"><svg className="i "><use href="#i-back"/></svg></button>
            <h1 id="view-title">Home</h1>
          </div>
          <div className="top-actions">
            <button className="cbtn glass" id="search-btn" title="Search"><svg className="i "><use href="#i-search"/></svg></button>
            <button className="avatar" id="account-btn" title="Settings"><svg className="i "><use href="#i-person"/></svg></button>
          </div>
        </header>

        <main>
          <section className="view active" id="v-home">
            <nav className="chips glass" id="chips">
              <button className="chip active" data-q="">All</button>
              <button className="chip" data-q="podcast">Podcasts</button>
              <button className="chip" data-q="feel good songs">Feel good</button>
              <button className="chip" data-q="workout songs">Workout</button>
              <button className="chip" data-q="energize songs">Energize</button>
              <button className="chip" data-q="relax songs">Relax</button>
              <button className="chip" data-q="romance songs">Romance</button>
              <button className="chip" data-q="commute songs">Commute</button>
              <button className="chip" data-q="party songs">Party</button>
              <button className="chip" data-q="focus songs">Focus</button>
              <button className="chip" data-q="sleep songs">Sleep</button>
              <button className="chip" data-q="sad songs">Sad</button>
            </nav>
            <div className="greet"><button className="brandline" id="brand-name" title="Change your name" type="button"><span id="brand-text">MixTape</span><svg className="i "><use href="#i-edit"/></svg></button><h2 id="greet">Good morning</h2><p id="date"></p></div>
            <div className="card-sec glass">
              <div className="sec-head"><div><h4>My genres</h4><p>Tap a vibe to start instant radio</p></div></div>
              <div className="hscroll genres" id="genres"></div>
            </div>
            <div className="tiles" id="tiles"></div>
            <div id="mood-shelf"></div>
            <div id="home-sections"><div className="skel-block glass"></div><div className="skel-block glass"></div></div>
          </section>

          <section className="view" id="v-search">
            <div className="searchbox glass">
              <svg className="i "><use href="#i-search"/></svg>
              <input id="query-input" type="text" placeholder="Songs, artists, or paste a link" autoComplete="off" autoCapitalize="off" spellCheck="false" />
              <button id="clear-btn" className="x hidden" title="Clear"><svg className="i "><use href="#i-close"/></svg></button>
            </div>
            <div className="suggest glass hidden" id="suggest"></div>
            <div className="browse" id="browse"></div>
            <div className="rows glass-list" id="results"></div>
          </section>

          <section className="view" id="v-stats"><div id="stats-body"></div></section>

          <section className="view" id="v-library">
            <div className="seg lib-seg" id="lib-seg"><button className="on" data-lib="liked">Liked songs</button><button data-lib="playlists">Playlists</button></div>
            <div id="lib-body"></div>
          </section>

          <section className="view" id="v-playlist"><div id="pl-body"></div></section>

          <section className="view" id="v-queue">
            <div className="q-head"><h2>Queue</h2><p id="q-count">0 songs</p>
              <div className="qbar"><button className="pill sm glass" id="auto-btn" title="Keep adding similar songs">&infin; Autoplay</button><button className="pill sm glass" id="q-clear">Clear queue</button></div></div>
            <div id="queue-body"></div>
          </section>

          <section className="view" id="v-settings"><div id="settings-body"></div></section>
        </main>

        <div className="toast glass" id="status-msg" role="status"></div>

        <div className="mini glass hidden" id="mini">
          <div className="art" id="mini-art"></div>
          <div className="mini-txt"><b id="mini-title">Nothing playing</b><span id="mini-artist"></span></div>
          <button className="round acc" id="mini-play"><svg className="i "><use href="#i-play"/></svg></button>
          <button className="round" id="mini-next"><svg className="i "><use href="#i-next"/></svg></button>
          <i className="mini-prog" id="mini-prog"></i>
        </div>

        <nav className="nav glass" id="nav">
          <i className="nav-rim" aria-hidden="true"></i>
          <i className="lens" id="lens"></i>
          <button className="active" data-view="home"><svg className="i "><use href="#i-home"/></svg><span>Feed</span></button>
          <button data-view="stats"><svg className="i "><use href="#i-bars"/></svg><span>Stats</span></button>
          <button data-view="library"><svg className="i "><use href="#i-lib"/></svg><span>Library</span></button>
        </nav>
      </div>

      <div className="sheet-back" id="sheet-back"></div>
      <div className="sheet glass" id="sheet"></div>
      <div className="modal-back" id="modal-back"><div className="modal glass" id="modal"></div></div>

      <section className="player" id="player" aria-hidden="true">
        <div className="p-bg" id="p-bg"></div><div className="p-poster" id="p-poster"></div><div className="p-shade"></div>
        <header className="p-top">
          <button className="cbtn pbtn" id="p-close" title="Close"><svg className="i "><use href="#i-down"/></svg></button>
          <div className="p-ctx"><b>NOW PLAYING</b><span id="p-src">Queue</span></div>
          <button className="cbtn pbtn" id="p-more" title="More"><svg className="i "><use href="#i-more"/></svg></button>
        </header>
        <div className="cf" id="cf" aria-hidden="true"><div className="cf-stage" id="cf-stage"></div></div>
        <div className="p-bottom">
          <div className="p-info">
            <div className="p-text"><div className="p-title-wrap"><h2 id="p-title">Nothing playing</h2></div><div className="p-sub"><p id="p-artist"></p><span className="fmt-tag" id="fmt-tag" hidden></span></div></div>
            <div className="p-act">
              <button className="cbtn round-l dk sv" id="p-like" title="Like"><svg className="i "><use href="#i-heart"/></svg></button>
              <button className="cbtn round-l dk" id="p-lyrics" title="Lyrics"><svg className="i "><use href="#i-mic"/></svg></button>
            </div>
          </div>
          <div className="seek" id="seek" style={{"--p":"0"}}><i className="fill"></i><i className="bead"></i></div>
          <div className="times"><span id="current-time">0:00</span><span id="duration-time">-0:00</span></div>
          <div className="p-ctrl">
            <button className="ring" id="prev-btn" title="Previous"><svg className="i "><use href="#i-prev"/></svg></button>
            <button className="ring main" id="play-pause-btn" title="Play / pause"><svg className="i "><use href="#i-play"/></svg></button>
            <button className="ring" id="next-btn" title="Next"><svg className="i "><use href="#i-next"/></svg></button>
          </div>
          <div className="p-row">
            <button className="ring" id="shuffle-btn" title="Shuffle"><svg className="i "><use href="#i-shuffle"/></svg></button>
            <div className="ring split">
              <button id="mute-btn" title="Mute"><svg className="i "><use href="#i-volume"/></svg></button>
              <input type="range" id="volume-bar" className="vol-desk" min="0" max="1" step="0.02" defaultValue="0.85" />
              <i className="sep"></i>
              <button id="queue-btn" title="Queue"><svg className="i "><use href="#i-queue"/></svg></button>
            </div>
            <button className="ring" id="repeat-btn" title="Repeat"><svg className="i "><use href="#i-repeat"/></svg><em></em></button>
          </div>
        </div>

        <div className="lyrics" id="lyrics">
          <div className="l-bg" id="l-bg"></div>
          <header className="p-top">
            <button className="cbtn pbtn" id="l-back" title="Back"><svg className="i "><use href="#i-back"/></svg></button>
            <div className="p-ctx"><b>LYRICS</b><span id="l-title"></span></div>
            <button className="cbtn pbtn" id="l-share" title="Share lyrics"><svg className="i "><use href="#i-share"/></svg></button>
          </header>
          <div className="l-tools">
            <button className="l-badge glass" id="l-badge" title="Change lyrics source">LINE SYNC</button>
            <span className="l-off glass"><button id="l-minus" title="Lyrics earlier">&minus;</button><em id="l-offv">0.0s</em><button id="l-plus" title="Lyrics later">+</button></span>
          </div>
          <div className="l-scroll" id="l-scroll"></div>
          <div className="l-sharebar glass" id="l-sharebar"><span id="l-selcount">Tap lines to select</span><button className="pill pill-acc sm" id="l-make">Create card</button><button className="pill sm" id="l-cancel">Cancel</button></div>
          <div className="l-bottom">
            <div className="seek" id="l-seek" style={{"--p":"0"}}><i className="fill"></i><i className="bead"></i></div>
            <div className="l-ctrl">
              <span id="l-cur">0:00</span>
              <div className="p-ctrl"><button className="ring" id="l-prev"><svg className="i "><use href="#i-prev"/></svg></button><button className="ring main" id="l-play"><svg className="i "><use href="#i-play"/></svg></button><button className="ring" id="l-next"><svg className="i "><use href="#i-next"/></svg></button></div>
              <span id="l-left">-0:00</span>
            </div>
          </div>
        </div>
      </section>

      <Script src={`/amlyrics.js?v=${v}`} strategy="beforeInteractive" />
      <Script src={`/app.js?v=${v}`} strategy="afterInteractive" />
    </>
  );
}
