#!/bin/sh
# env.sh

if [ "$NODE_ENV" = "development" ]; then
    CONFIG_FILE="./build/env-config.js"
else
    # For Nginx, use: /usr/share/nginx/html/env-config.js
    # For Node/serve, use: ./build/env-config.js
    CONFIG_FILE="/usr/share/nginx/html/env-config.js"
fi

echo "window._env_ = {" > $CONFIG_FILE

for var in $(env | grep '^REACT_APP_'); do
    key=$(echo "$var" | cut -d '=' -f 1)
    value=$(echo "$var" | cut -d '=' -f 2-)
    echo "  $key: \"$value\"," >> $CONFIG_FILE
done

echo "}" >> $CONFIG_FILE

exec "$@"