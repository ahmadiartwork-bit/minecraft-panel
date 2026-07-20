#!/bin/bash

# Start the panel server in background
node /opt/panel/server.js &

# Start the Minecraft server
exec /start "$@"
