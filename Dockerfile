FROM itzg/minecraft-server:latest

ENV EULA=TRUE
ENV TYPE=PAPER
ENV VERSION=1.21.5
ENV MEMORY=2G
ENV DIFFICULTY=normal
ENV GAMEMODE=survival
ENV ONLINE_MODE=TRUE
ENV MAX_PLAYERS=20
ENV VIEW_DISTANCE=10
ENV SYNC_PACKS=true
ENV RCON_PASSWORD=minecraft123
ENV ENABLE_RCON=true
ENV RCON_PORT=25575
ENV QUERY_PORT=25565
ENV ENABLE_QUERY=true

RUN apt-get update && apt-get install -y \
    curl \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /opt/panel
COPY backend/package*.json ./
RUN npm install --production
COPY backend/ ./
COPY panel/ /opt/panel/public/

ENV PANEL_PASSWORD=admin123
ENV MC_HOST=localhost
ENV MC_RCON_PORT=25575
ENV MC_RCON_PASSWORD=minecraft123
ENV MC_SERVER_DIR=/data

EXPOSE 25565
EXPOSE 25575
EXPOSE 5000

CMD ["sh", "-c", "node /opt/panel/server.js & /start"]
