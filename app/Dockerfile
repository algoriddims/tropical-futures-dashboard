# Hosted build (Railway or any Docker host). Set the service's root
# directory to `app/` and DASHBOARD_PASSWORD in its variables — see
# docs/deploy/railway.md.

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/dist ./dist
COPY server.mjs ./
USER node
EXPOSE 3000
CMD ["node", "server.mjs"]
