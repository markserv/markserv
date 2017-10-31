function start () {
  var searchInput = document.getElementsByName('search')[0]
  console.log(searchInput)

  var socket = io('http://127.0.0.1:34567')
  console.log(socket)

  //socket.emit('add user', username);
  // socket.on('login', function (data) {
}

document.addEventListener('DOMContentLoaded', start)