FROM haskell:9.6 AS haskell-base
FROM node:lts

COPY --from=haskell-base /opt/ghc /opt/ghc
COPY --from=haskell-base /usr/local/bin/cabal /usr/local/bin/cabal

ENV PATH=/opt/ghc/9.6.7/bin:$PATH

RUN cabal update && \
    cabal install --lib aeson QuickCheck process containers bytestring --package-env /root/.ghc/x86_64-linux-9.6.7/environments/default

RUN npm install -g pnpm

WORKDIR /usr/src/app

COPY . .

RUN pnpm install

EXPOSE 3000

ENV TARGET=@watervein/example-helloworld

CMD ["sh", "-c", "pnpm --filter $TARGET exec vite --host 0.0.0.0 --port 3000"]