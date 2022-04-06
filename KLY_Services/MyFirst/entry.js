import {LOG} from '../CommonResources/utils.js'


LOG({data:'🔥Dummy example of service!🔥',pid:process.pid},'CD')


setInterval(()=>LOG({data:'Test message from MyFirst service',pid:process.pid},'CD'),5000)