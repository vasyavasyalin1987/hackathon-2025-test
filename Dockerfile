FROM node:18
WORKDIR /app
COPY package*.json .
RUN npm install
COPY . .
RUN npm install
CMD ["node", "server.js"]