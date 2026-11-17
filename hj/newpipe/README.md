# MixTape × NewPipeExtractor service

Java wrapper around [TeamNewPipe/NewPipeExtractor](https://github.com/TeamNewPipe/NewPipeExtractor)
(GPLv3). Vercel's Python runtime has no JVM, so this runs as a separate service
(Render / Railway / Fly.io / any Docker host).

    docker build -t mixtape-newpipe .
    docker run -p 8080:8080 -e NEWPIPE_API_KEY=secret mixtape-newpipe

Then set on the Vercel project:

    NEWPIPE_URL=https://your-service.example.com
    NEWPIPE_API_KEY=secret          # same value as above
