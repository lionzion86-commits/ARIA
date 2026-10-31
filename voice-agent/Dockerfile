# Aria's owned voice worker, as LiveKit Cloud runs it (lk agent create /
# lk agent deploy, from this directory). The secrets are the agent's, set
# in LiveKit Cloud -- names in README.md; none are baked into the image.
FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY src ./src
# The VAD and turn models, fetched at build time so a cold worker does
# not download them inside a shopper's call.
RUN npx livekit-agents download-files
CMD ["node", "src/worker.mjs", "start"]
