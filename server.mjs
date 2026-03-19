import { createServer } from 'http'
import next from 'next'
import { Server } from 'socket.io'

const port = parseInt(process.env.PORT || '3000', 10)
const dev = process.env.NODE_ENV !== 'production'
const app = next({ dev })
const handle = app.getRequestHandler()

// rooms: Map<roomId, Map<socketId, { username }>>
const rooms = new Map()

app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    handle(req, res)
  })

  const io = new Server(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
  })

  io.on('connection', (socket) => {
    let currentRoom = null
    let currentUsername = null

    socket.on('join-room', ({ roomId, username }) => {
      // Sanitize inputs
      const safeRoomId = String(roomId).slice(0, 50)
      const safeUsername = String(username).slice(0, 30)

      // Leave previous room
      if (currentRoom) {
        const prevRoom = rooms.get(currentRoom)
        if (prevRoom) {
          prevRoom.delete(socket.id)
          if (prevRoom.size === 0) rooms.delete(currentRoom)
        }
        socket.to(currentRoom).emit('user-left', { socketId: socket.id })
        socket.leave(currentRoom)
      }

      currentRoom = safeRoomId
      currentUsername = safeUsername
      socket.join(safeRoomId)

      if (!rooms.has(safeRoomId)) rooms.set(safeRoomId, new Map())
      const room = rooms.get(safeRoomId)

      // Limit to 2 participants per room (1:1 call design)
      if (room.size >= 2) {
        socket.emit('room-full', { roomId: safeRoomId })
        return
      }

      const existingUsers = Array.from(room.entries()).map(([id, data]) => ({
        socketId: id,
        username: data.username,
      }))

      room.set(socket.id, { username: safeUsername })

      socket.emit('room-joined', { existingUsers })
      socket.to(safeRoomId).emit('user-joined', {
        socketId: socket.id,
        username: safeUsername,
      })
    })

    socket.on('offer', ({ to, offer }) => {
      if (typeof to !== 'string' || !offer || !currentRoom) return
      const room = rooms.get(currentRoom)
      if (!room?.has(to)) return // 'to' must be a member of the same room
      io.to(to).emit('offer', { from: socket.id, offer })
    })

    socket.on('answer', ({ to, answer }) => {
      if (typeof to !== 'string' || !answer || !currentRoom) return
      const room = rooms.get(currentRoom)
      if (!room?.has(to)) return
      io.to(to).emit('answer', { from: socket.id, answer })
    })

    socket.on('ice-candidate', ({ to, candidate }) => {
      if (typeof to !== 'string' || !candidate || !currentRoom) return
      const room = rooms.get(currentRoom)
      if (!room?.has(to)) return
      io.to(to).emit('ice-candidate', { from: socket.id, candidate })
    })

    socket.on('disconnect', () => {
      if (currentRoom) {
        const room = rooms.get(currentRoom)
        if (room) {
          room.delete(socket.id)
          if (room.size === 0) rooms.delete(currentRoom)
        }
        socket.to(currentRoom).emit('user-left', { socketId: socket.id })
      }
    })
  })

  httpServer.listen(port, () => {
    console.log(`> AnonChat ready at http://localhost:${port}`)
  })
})
