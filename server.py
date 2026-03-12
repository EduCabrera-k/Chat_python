import eventlet
eventlet.monkey_patch()
import os
from flask import Flask, render_template, request
from flask_socketio import SocketIO, join_room, emit

app = Flask(__name__)
# Configura Sockets para que cualquier cliente pueda conectarse
socketio = SocketIO(app, cors_allowed_origins="*")

# Diccionario para guardar qué usuario está en qué sala
usuarios = {}

@app.route("/")
def index():
    return render_template("index.html")

@socketio.on("register")
def register(data):
    # Registra al usuario y lo une a una sala específica
    sid = request.sid
    usuarios[sid] = {"nombre": data["nombre"], "sala": data["sala"]}
    join_room(data["sala"])
    
    # Avisa a los demás en la sala que alguien nuevo llegó
    emit("user_joined", {"sid": sid, "nombre": data["nombre"]}, room=data["sala"], include_self=False)
    emit("system", f"🟢 {data['nombre']} se unió", room=data["sala"])

@socketio.on("send_message")
def send_message(data):
    # Recibe un mensaje y lo reenvía a todos en la misma sala
    usuario = usuarios.get(request.sid)
    if usuario:
        emit("receive_message", {"nombre": usuario["nombre"], "mensaje": data["mensaje"]}, room=usuario["sala"])

# SEÑALIZACIÓN WEBRTC
@socketio.on("webrtc_offer")
def webrtc_offer(data):
    # Aquí el servidor recibe la oferta de video y la manda al destinatario
    emit("webrtc_offer", {"offer": data["offer"], "from": request.sid}, room=data["target"])

@socketio.on("webrtc_answer")
def webrtc_answer(data):
    # Aquí el servidor recibe la respuesta de video y la manda de vuelta al que llamó
    emit("webrtc_answer", {"answer": data["answer"], "from": request.sid}, room=data["target"])

@socketio.on("webrtc_candidate")
def webrtc_candidate(data):
    # Aquí el servidor intercambia las direcciones de red para que los usuarios se encuentren
    emit("webrtc_candidate", {"candidate": data["candidate"], "from": request.sid}, room=data["target"])

@socketio.on("disconnect")
def disconnect():
    # Limpia los datos del usuario cuando se sale
    sid = request.sid
    if sid in usuarios:
        u = usuarios.pop(sid)
        emit("user_left", {"sid": sid}, room=u["sala"], include_self=False)
        emit("system", f"🔴 {u['nombre']} salió de la sala", room=u["sala"])
        
if __name__ == '__main__':
    # Render asigna un puerto automáticamente en la variable de entorno PORT
    port = int(os.environ.get('PORT', 5000))
    socketio.run(app, host='0.0.0.0', port=port)


#http://192.168.1.75:5000/   (link socket)  - No deja usar la camara a menos que este en un tunel (ngrok)
#http://127.0.0.1:5000/ (link localhost)   - deja usar la camara pero solo localmente,se puede en otras computadoras pero en el tunel (ngrok) 
                                    