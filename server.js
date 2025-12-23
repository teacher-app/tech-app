const WebSocket = require('ws');
const http = require('http');

const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('SFU Server Ready');
});

const wss = new WebSocket.Server({ server });

const rooms = new Map();

wss.on('connection', (ws) => {
    ws.id = Math.random().toString(36).substr(2, 9);
    console.log(`Client connected: ${ws.id}`);
    
    ws.on('message', (data) => {
        try {
            const message = JSON.parse(data);
            
            switch(message.type) {
                case 'create-room':
                    createRoom(ws, message.roomId);
                    break;
                    
                case 'join-room':
                    joinRoom(ws, message.roomId);
                    break;
                    
                case 'offer':
                    forwardOffer(ws, message);
                    break;
                    
                case 'answer':
                    forwardAnswer(ws, message);
                    break;
                    
                case 'ice-candidate':
                    forwardIceCandidate(ws, message);
                    break;
            }
        } catch (error) {
            console.error('Error:', error);
        }
    });
    
    ws.on('close', () => {
        removeClient(ws);
    });
});

function createRoom(ws, roomId) {
    if (!rooms.has(roomId)) {
        rooms.set(roomId, {
            broadcaster: ws,
            viewers: []
        });
    } else {
        rooms.get(roomId).broadcaster = ws;
    }
    
    ws.roomId = roomId;
    ws.isBroadcaster = true;
    
    ws.send(JSON.stringify({ type: 'room-created', roomId }));
}

function joinRoom(ws, roomId) {
    if (!rooms.has(roomId)) {
        ws.send(JSON.stringify({ type: 'error', message: 'Room not found' }));
        return;
    }
    
    const room = rooms.get(roomId);
    room.viewers.push(ws);
    
    ws.roomId = roomId;
    ws.isBroadcaster = false;
    
    ws.send(JSON.stringify({ type: 'room-joined', roomId }));
    
    // إعلام المذيع بمشاهد جديد
    room.broadcaster.send(JSON.stringify({
        type: 'viewer-count',
        count: room.viewers.length
    }));
}

function forwardOffer(ws, message) {
    const room = rooms.get(message.roomId);
    if (!room) return;
    
    // إذا كان العرض من المذيع، أرسله لجميع المشاهدين
    if (ws.isBroadcaster) {
        room.viewers.forEach(viewer => {
            if (viewer.readyState === 1) {
                viewer.send(JSON.stringify({
                    type: 'offer',
                    sdp: message.sdp,
                    roomId: message.roomId
                }));
            }
        });
    }
}

function forwardAnswer(ws, message) {
    const room = rooms.get(message.roomId);
    if (!room) return;
    
    // إذا كانت الإجابة من مشاهد، أرسلها للمذيع
    if (!ws.isBroadcaster && room.broadcaster.readyState === 1) {
        room.broadcaster.send(JSON.stringify({
            type: 'answer',
            sdp: message.sdp,
            roomId: message.roomId
        }));
    }
}

function forwardIceCandidate(ws, message) {
    const room = rooms.get(message.roomId);
    if (!room) return;
    
    if (ws.isBroadcaster) {
        // من المذيع لجميع المشاهدين
        room.viewers.forEach(viewer => {
            if (viewer.readyState === 1) {
                viewer.send(JSON.stringify({
                    type: 'ice-candidate',
                    candidate: message.candidate,
                    roomId: message.roomId
                }));
            }
        });
    } else {
        // من المشاهد للمذيع
        if (room.broadcaster.readyState === 1) {
            room.broadcaster.send(JSON.stringify({
                type: 'ice-candidate',
                candidate: message.candidate,
                roomId: message.roomId
            }));
        }
    }
}

function removeClient(ws) {
    if (!ws.roomId || !rooms.has(ws.roomId)) return;
    
    const room = rooms.get(ws.roomId);
    
    if (ws.isBroadcaster) {
        // إذا خرج المذيع، أرسل رسالة للمشاهدين
        room.viewers.forEach(viewer => {
            if (viewer.readyState === 1) {
                viewer.send(JSON.stringify({ type: 'broadcaster-left' }));
            }
        });
        rooms.delete(ws.roomId);
    } else {
        // إذا خرج مشاهد، أزله من القائمة
        const index = room.viewers.indexOf(ws);
        if (index > -1) {
            room.viewers.splice(index, 1);
        }
        
        // تحديث عدد المشاهدين
        if (room.broadcaster.readyState === 1) {
            room.broadcaster.send(JSON.stringify({
                type: 'viewer-count',
                count: room.viewers.length
            }));
        }
    }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
