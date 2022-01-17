FROM node:16

ENV NODE_ENV production

#Move to own location
WORKDIR /usr/src/KLYNTAR

COPY package*.json ./
COPY . .

#Create sub-directories for DBs ———> Via this template mkdir -p A/{dir1,dir2,...}
#What about dirs for each hostchain
#And make it available from everywhere as binary via symlink
RUN npm ci --only=production && mkdir M C && npm link && chmod +x klyn74r.js && apt update && apt upgrade && apt install nano net-tools

#Traditionally use 7777 as default KLYNTAR port.You can change if you need(but change configs also to run instance)
#Note:You can use external or in-built firewall,ACL and other network polices as you need(and if you know how to do it) 
EXPOSE 7777