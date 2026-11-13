# A self-contained evaluation copy of the archive: the built app plus the Firebase
# emulators, so trying it needs Docker and nothing else. Not a production server —
# the emulators have no real authentication. See docs/DOCKER.md.

# --- The app, built against the emulators --------------------------------------
FROM node:22-trixie-slim AS build
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
# Vite bakes these in at build time. They are placeholders, not secrets: a `demo-`
# project ID is Firebase's reserved prefix for a project that does not exist, so
# nothing in this image can reach a real Google resource even by mistake.
ENV VITE_USE_FIREBASE_EMULATOR=true \
    VITE_FIREBASE_API_KEY=demo-key \
    VITE_FIREBASE_AUTH_DOMAIN=demo-archive.firebaseapp.com \
    VITE_FIREBASE_PROJECT_ID=demo-archive \
    VITE_FIREBASE_STORAGE_BUCKET=demo-archive.appspot.com \
    VITE_FIREBASE_MESSAGING_SENDER_ID=0 \
    VITE_FIREBASE_APP_ID=1:0:web:0
# `vite build` alone: `tsc -b` follows src/test, which is left out of the context,
# and type checking is CI's job rather than the image's.
RUN npx vite build
# functions/shared/seo.cjs and functions/shell.html are not committed. Generate
# both from this build, which has no SITE_URL, so the image names no museum's site.
RUN node scripts/prepare-functions.cjs

# --- The runtime: Java for the emulators, and only what they need ---------------
FROM node:22-trixie-slim
RUN apt-get update \
    && apt-get install -y --no-install-recommends openjdk-21-jre-headless \
    && rm -rf /var/lib/apt/lists/*

# The volume's mount point must exist and be writable before a named volume is
# first attached, or Docker creates it owned by root and the export fails.
RUN install -d -o node -g node /app /data
WORKDIR /app
USER node

# The CLI and Admin SDK, at the versions the repo's lockfile pins, without the
# rest of the root package's dev dependencies.
COPY package-lock.json /tmp/root-lock.json
RUN node -e "const l=require('/tmp/root-lock.json').packages,v=n=>n+'@'+l['node_modules/'+n].version;console.log(v('firebase-tools'),v('firebase-admin'))" > /tmp/pins \
    && npm init -y >/dev/null \
    && npm install --omit=dev --no-package-lock --no-audit --no-fund $(cat /tmp/pins)

COPY --chown=node:node functions/ functions/
COPY --from=build --chown=node:node /src/functions/shared/seo.cjs functions/shared/seo.cjs
COPY --from=build --chown=node:node /src/functions/shell.html functions/shell.html
RUN cd functions && npm ci --omit=dev --no-audit --no-fund

# Download the emulators now, so starting needs no internet.
RUN npx firebase setup:emulators:firestore \
    && npx firebase setup:emulators:storage \
    && npx firebase setup:emulators:ui

COPY firestore.rules firestore.indexes.json storage.rules ./
COPY scripts/ scripts/
COPY docker/firebase.json ./firebase.json
COPY docker/start.cjs ./start.cjs
COPY --from=build /src/dist ./dist

# Only the ports published 1:1 work: the built app has them hard-coded.
EXPOSE 5174 4000 8080 9099 9199 5001 4400 4500 9150
VOLUME /data

ENV DIRECTOR_EMAIL=director@examplemuseum.org \
    SUPPORT_ADMINS=
# A plain connection rather than a request: a request would add a line to the
# hosting log every interval and scroll the "ready" box off the screen.
HEALTHCHECK --interval=10s --timeout=3s --start-period=90s --retries=3 \
    CMD node -e "require('net').connect(5174,'127.0.0.1').on('connect',()=>process.exit(0)).on('error',()=>process.exit(1))"

CMD ["node", "start.cjs"]
