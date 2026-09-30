# ReachInbox backend image — runs EITHER the API or the worker.
#
# The two are separate processes by design (the API enqueues, the worker sends),
# so deploy this image twice and override the start command for the worker:
#
#   API service     : default CMD  (npm run start)
#   Worker service  : npm run worker
#
# Build context is the REPOSITORY ROOT:
#   docker build -t reachinbox-server .

# Debian (not alpine): Prisma's query engine needs a glibc build and OpenSSL.
FROM node:20-slim

WORKDIR /app

# Prisma requires OpenSSL at runtime; the slim image omits it.
RUN apt-get update -y \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Dependencies first, so source edits do not invalidate the install layer.
# tsx is a devDependency and the start script uses it, so dev deps are installed
# deliberately — this image runs TypeScript directly rather than pre-compiling.
COPY server/package.json server/package-lock.json* ./
RUN npm install

# Prisma client must be generated against the schema before the app starts.
COPY server/prisma ./prisma
RUN npx prisma generate

COPY server/tsconfig.json ./
COPY server/src ./src

# Local-disk attachment mode writes here. In production, configure S3_* instead —
# a container filesystem is not shared between the API and worker services.
RUN mkdir -p uploads/attachments

ENV NODE_ENV=production
EXPOSE 8010

# Default command runs the API. Override for the worker service.
CMD ["npm", "run", "start"]
