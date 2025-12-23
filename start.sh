#!/bin/sh
# تعيين متغير البيئة المطلوب لتشغيل Owncast
export OWNCAST_BASEURL="https://cripanyt-production.up.railway.app"
# تشغيل Owncast على المنفذ الذي يحدده Railway
exec /app/owncast --webserverport=$PORT
