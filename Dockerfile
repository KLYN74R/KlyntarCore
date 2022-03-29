FROM debian

#Move to own location
WORKDIR /root/KLYNTAR

COPY package*.json ./
COPY . .

RUN chmod 777 setup.sh build.sh klyn74r.js && ./setup.sh && pnpm install && npm link

ENV NODE_ENV production

#Traditionally use 7777 as default KLYNTAR port.You can change if you need(but change configs also to run instance)
#Note:You can use external or in-built firewall,ACL and other network polices as you need(and if you know how to do it)
EXPOSE 7777 8888 9999