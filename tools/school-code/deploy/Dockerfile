FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY src ./src
COPY scripts ./scripts
# The build script generates chrome-extension/worker-main.js from the
# browser worker source. Keep the MV3 extension directory present in the
# build stage even though the relay image does not ship it at runtime.
COPY chrome-extension ./chrome-extension
RUN npm run build
FROM node:22-alpine
WORKDIR /app
COPY --from=build /app/dist/relay.cjs ./relay.cjs
ENV HOST=0.0.0.0 PORT=18880
USER node
EXPOSE 18880
CMD ["node", "relay.cjs"]
