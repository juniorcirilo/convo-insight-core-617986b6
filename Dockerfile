FROM ubuntu:24.04

ENV NODE_ENV=development
ENV PORT=3000
ENV TZ=America/Sao_Paulo
WORKDIR /app

COPY package*.json ./


RUN apt-get update && apt-get install -y curl gnupg2 ca-certificates

# install postgres client 17
RUN curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | apt-key add - \
	&& CODENAME=$(grep '^VERSION_CODENAME=' /etc/os-release | cut -d= -f2) \
	&& echo "deb http://apt.postgresql.org/pub/repos/apt/ ${CODENAME}-pgdg main" > /etc/apt/sources.list.d/pgdg.list \
	&& apt-get update && apt-get install -y postgresql-client-17

# add minio client
RUN curl -O https://dl.min.io/client/mc/release/linux-amd64/mc
RUN chmod +x mc
RUN mv mc /usr/local/bin/mc


# install nodejs 22
RUN apt-get update && apt-get install -y curl gnupg2 ca-certificates
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
RUN apt-get install -y nodejs

# install bun
RUN apt-get update && apt-get install -y unzip
RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:${PATH}"

COPY . .

RUN mv app-entrypoint.sh /usr/local/entrypoint.sh
RUN chmod +x /usr/local/entrypoint.sh


RUN bun install

EXPOSE 3000

VOLUME ["/app"]
ENTRYPOINT [ "/usr/local/entrypoint.sh" ]
CMD ["npm", "run", "dev"]