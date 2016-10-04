var socket = io();


var winId = window.location.pathname;

socket.on('requestId', function(){
	socket.emit('heresId', winId);
});


window.onload = function () {
  if (window.location.href.indexOf('page_y') != -1) {
    var match = window.location.href.split('?')[1].split("&")[0].split("=");
    document.getElementsByTagName("body")[0].scrollTop = match[1];
  }
}


socket.on('refresh', function(timestamp){
	console.log('Reloading!');
	// window.location = window.location;
	
	// $('<div>').load(window.location+' #special-div', function(data){
	// 	console.log(data);
	// // 	$('article.markdown-body').html();
	// // 	console.log($(data).split( '<article class="markdown-body">')[0] );
	// });


	var page_y = document.getElementsByTagName("body")[0].scrollTop;
  window.location.href = window.location.href.split('?')[0] + '?page_y=' + page_y;
  

});


socket.on('scrollTo', function(val){
	// window.scrollTo(0, val);
});



addEventListener('scroll', function(e){
	 var scrollTop = document.documentElement.scrollTop || document.body.scrollTop;
	 socket.emit('scroll', {
	 		id: winId,
	 		scrollTop: scrollTop
	 	});
});
























// console.log(window.location.pathName);




hljs.configure({
  tabReplace: '    ', // 4 spaces
})
// hljs.initHighlighting();
hljs.initHighlightingOnLoad();