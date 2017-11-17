function start() {
  var searchbar = document.getElementById('searchBar')
  var closeButton = document.getElementById('closeButton')
  var searchTerm = document.getElementsByName('searchTerm')[0]
  var searchButton = document.getElementById('searchButton')
  var searchResults = document.getElementById('searchResults')

  var socket = io('http://127.0.0.1:34567')

  socket.on('search_results', function(results) {
    searchResults.innerHTML = ''

    results.forEach(result => {
      console.log(result)

      var resultElem = document.createElement('div')
      resultElem.className = 'result'

      var title = document.createElement('a')
      title.innerHTML = result.content.title
      title.setAttribute('href', result.content.href)
      title.className = 'title'
      resultElem.appendChild(title)

      var filepath = document.createElement('a')
      filepath.innerHTML = result.content.id
      filepath.setAttribute('href', result.content.href)
      filepath.className = 'filepath'
      resultElem.appendChild(filepath)

      var content = document.createElement('div')
      content.innerHTML = result.content.body
      content.className = 'content'
      resultElem.appendChild(content)

      searchResults.appendChild(resultElem)
    })
  })

  searchButton.onclick = function () {
    var term = searchTerm.value
    socket.emit('search', term)
  }

  var isOverlayClosed = false

  function toggleSearchOverlay() {
    isOverlayClosed = !isOverlayClosed

    if (isOverlayClosed) {
      searchbar.className = 'closed'
    } else {
      searchbar.className = ''
    }
  }

  closeButton.onclick = toggleSearchOverlay
}

document.addEventListener('DOMContentLoaded', start)
