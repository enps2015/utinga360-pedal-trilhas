FROM node:22-alpine AS base
WORKDIR /app

# Instala dependências (usa npm ci se houver package-lock.json, caso contrário npm install)
COPY package*.json ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install --no-audit --no-fund; fi

# Copia o código-fonte e gera o bundle estático (dist/)
COPY . .
RUN npm run build

# Remove devDependencies mantendo tsx em dependencies para executar server.ts
RUN npm prune --omit=dev

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

CMD ["npm", "start"]
