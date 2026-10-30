FROM apify/actor-node:22

COPY --chown=myuser package*.json ./

RUN npm ci --omit=dev --audit=false \
    && rm -rf ~/.npm

COPY --chown=myuser . ./

CMD ["npm", "start", "--silent"]
