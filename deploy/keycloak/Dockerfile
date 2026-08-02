FROM node:24.15.0-bookworm-slim AS provider-tools
RUN apt-get update \
    && apt-get install -y --no-install-recommends maven \
    && rm -rf /var/lib/apt/lists/*

FROM provider-tools AS theme-builder
WORKDIR /workspace/theme
COPY deploy/keycloak/theme/package.json deploy/keycloak/theme/package-lock.json ./
RUN npm ci --ignore-scripts
COPY deploy/keycloak/theme/index.html deploy/keycloak/theme/tsconfig.json deploy/keycloak/theme/vite.config.ts ./
COPY deploy/keycloak/theme/src ./src
RUN --mount=type=cache,id=ai-crm-keycloak-theme-maven,target=/workspace/theme/node_modules/.cache/keycloakify/.m2 \
    npm run build:keycloak

FROM quay.io/keycloak/keycloak:26.3.1 AS provider-builder
USER root
COPY --from=provider-tools /usr/share/maven /usr/share/maven
COPY --from=provider-tools /usr/share/java /usr/share/java
COPY --from=provider-tools /etc/maven /etc/maven
ENV MAVEN_HOME=/usr/share/maven
ENV PATH="/usr/share/maven/bin:${PATH}"
WORKDIR /workspace/providers
COPY deploy/keycloak/providers/pom.xml ./pom.xml
RUN --mount=type=cache,id=ai-crm-keycloak-maven,target=/root/.m2 \
    mvn -B -q dependency:go-offline
COPY deploy/keycloak/providers/src ./src
RUN --mount=type=cache,id=ai-crm-keycloak-maven,target=/root/.m2 \
    mvn -B -q verify

FROM quay.io/keycloak/keycloak:26.3.1 AS keycloak-builder
COPY --from=theme-builder --chown=keycloak:keycloak /workspace/theme/dist_keycloak/keycloak-theme-for-kc-all-other-versions.jar /opt/keycloak/providers/zsj-crm-theme.jar
COPY --from=provider-builder --chown=keycloak:keycloak /workspace/providers/target/ai-crm-keycloak-providers-0.1.0.jar /opt/keycloak/providers/
RUN /opt/keycloak/bin/kc.sh build --db=postgres --health-enabled=true

FROM quay.io/keycloak/keycloak:26.3.1
COPY --from=keycloak-builder /opt/keycloak/ /opt/keycloak/
