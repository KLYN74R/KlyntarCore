import Docker from 'dockerode'


let docker = new Docker({protocol:'http', host: 'localhost', port: 2375})

// var docker1 = new Docker(); //defaults to above if env variables are not used
// var docker2 = new Docker({host: 'http://192.168.1.10', port: 3000});
//var docker = new Docker({protocol:'http', host: 'localhost', port: 2375});
// var docker4 = new Docker({host: '127.0.0.1', port: 3000}); //defaults to http

//docker.listContainers().then(console.log)




//Получение изменений контейнера
// docker.getContainer('jdmhe8o5stjixmzzmpwjswusj1gecavpss9wsvept1xx').changes().then(console.log)//.exec({Cmd:['date'], AttachStdin: false, AttachStdout: true},(e,r)=>console.log(r))

//Получить общую инфу по Докеру
//console.log(docker.info().then(console.log))

//Детальная инфа по версии
//console.log(docker.version().then(console.log))



//console.log(docker.getContainer('jdmhe8o5stjixmzzmpwjswusj1gecavpss9wsvept1xx').exec('echo DADAD >> fromhost.txt').then(console.log))
//docker.getContainer('jdmhe8o5stjixmzzmpwjswusj1gecavpss9wsvept1xx').exec({Cmd: ['shasum', '-'], AttachStdin: true, AttachStdout: true})


let options = {
      Cmd: ["echo", "'foo'"], AttachStdin: true, AttachStdout: true
    };
var container = docker.getContainer('jdmhe8o5stjixmzzmpwjswusj1gecavpss9wsvept1xx');

/**
 * Get env list from running container
 * @param container
 */
 function runExec(container) {

    var options = {
      Cmd: ['bash', '-c', 'echo test $VAR && timeout 3s node /root/server.js'],
      Env: ['VAR=ttslkfjsdalkfj'],
      AttachStdout: true,
      AttachStderr: true
    };
  
    container.exec(options, function(err, exec) {
      if (err) return;
      exec.start(function(err, stream) {
        if (err) return;
  
        container.modem.demuxStream(stream, process.stdout, process.stderr);
  
        exec.inspect(function(err, data) {
          if (err) return;
          console.log(data);
        });
      });
    });
  }


container.start().then(()=>runExec(container))