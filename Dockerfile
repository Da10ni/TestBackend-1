# ---- Build stage ----
FROM node:22-alpine AS build
WORKDIR /app

# OpenSSL is required by Prisma's query engine on Alpine.
RUN apk add --no-cache openssl

COPY package*.json ./
RUN npm ci

COPY . .
# Prisma downloads native engines from binaries.prisma.sh. Some Docker build
# networks have flaky DNS to that CDN, so retry until it succeeds (and FAIL the
# build if it never does — don't silently continue without a generated client).
RUN i=0; until npx prisma generate; do \
      i=$((i+1)); \
      if [ "$i" -ge 10 ]; then echo "prisma generate failed after $i attempts"; exit 1; fi; \
      echo "prisma generate failed, retry $i..."; sleep 5; \
    done
RUN npm run build

# ---- Runtime stage ----
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

RUN apk add --no-cache openssl

# Copy node_modules (incl. Prisma CLI + ts-node) so the entrypoint can run
# `prisma migrate deploy` and the seed script at startup.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/src ./src
COPY --from=build /app/package*.json ./
COPY --from=build /app/tsconfig*.json ./
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x docker-entrypoint.sh

EXPOSE 3000
ENTRYPOINT ["./docker-entrypoint.sh"]
