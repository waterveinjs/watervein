FROM haskell:9.6 AS haskell-build

# Keep Cabal's package store in a predictable location so the runtime stage
# can copy it together with the package environment.
ENV CABAL_DIR=/root/.cabal

RUN cabal update && \
    cabal install --lib aeson QuickCheck process containers bytestring --package-env /root/.ghc/x86_64-linux-9.6.7/environments/default

FROM node:lts

# Carry over GHC and its installed package database/store from the Haskell image,
# where Cabal dependencies were built with the matching compiler toolchain.
COPY --from=haskell-build /opt/ghc /opt/ghc
COPY --from=haskell-build /usr/local/bin/cabal /usr/local/bin/cabal
COPY --from=haskell-build /root/.ghc /root/.ghc
COPY --from=haskell-build /root/.cabal /root/.cabal

ENV PATH=/opt/ghc/9.6.7/bin:$PATH

RUN npm install -g pnpm

WORKDIR /usr/src/app

COPY . .

RUN pnpm install

EXPOSE 3000

ENV TARGET=@watervein/example-helloworld

CMD ["sh", "-c", "pnpm --filter $TARGET exec vite --host 0.0.0.0 --port 3000"]
