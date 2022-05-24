FROM klyntar/all_in_one@sha256:cef57179678b7aef8e8eb4f7acf85551cc18c65f21e99fbc4fd375311f049834

#Move to own location
WORKDIR /root/KLYNTAR

COPY package*.json ./
COPY . .

RUN chmod 777 setup.sh build_addons.sh klyn74r.js && ./setup.sh && pnpm run build

ENV NODE_ENV production

EXPOSE 7777 8888 9999