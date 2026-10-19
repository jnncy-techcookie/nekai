# NEKAI database: official PostgreSQL with the schema baked in.
# init.sql runs once, the first time the container starts with an EMPTY data volume
# (compose's pg-data); an existing volume keeps its data and is not touched.
FROM postgres:16.15-alpine
COPY init.sql /docker-entrypoint-initdb.d/init.sql
