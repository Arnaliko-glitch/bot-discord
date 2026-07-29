-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Guild" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "icon" TEXT,
    "ownerId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Guild_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuildSettings" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "logChannelId" TEXT,
    "modLogChannelId" TEXT,
    "locale" TEXT NOT NULL DEFAULT 'fr',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GuildSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModuleConfig" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModuleConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WelcomeConfig" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "channelId" TEXT,
    "goodbyeChannelId" TEXT,
    "welcomeMessage" TEXT NOT NULL DEFAULT 'Bienvenue {user} sur **{server}** !',
    "goodbyeMessage" TEXT NOT NULL DEFAULT '{user} a quitt├⌐ le serveur.',
    "useEmbed" BOOLEAN NOT NULL DEFAULT true,
    "embedTitle" TEXT,
    "embedDescription" TEXT NOT NULL DEFAULT 'Bienvenue {user} ! Tu es le membre n┬░{memberCount}.',
    "embedColor" TEXT NOT NULL DEFAULT '#5865F2',
    "embedThumbnail" BOOLEAN NOT NULL DEFAULT true,
    "embedFooter" TEXT,
    "dmWelcome" BOOLEAN NOT NULL DEFAULT false,
    "goodbyeUseEmbed" BOOLEAN NOT NULL DEFAULT false,
    "goodbyeEmbedTitle" TEXT,
    "goodbyeEmbedDescription" TEXT NOT NULL DEFAULT '{username} a quitt├⌐ **{server}**.',
    "goodbyeEmbedColor" TEXT NOT NULL DEFAULT '#ed4245',
    "goodbyeEmbedThumbnail" BOOLEAN NOT NULL DEFAULT true,
    "goodbyeEmbedFooter" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WelcomeConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketConfig" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "categoryId" TEXT,
    "supportRoleId" TEXT,
    "panelChannelId" TEXT,
    "panelMessage" TEXT NOT NULL DEFAULT 'Cliquez sur le bouton pour ouvrir un ticket.',
    "ticketNameFormat" TEXT NOT NULL DEFAULT 'ticket-{username}',
    "maxOpenPerUser" INTEGER NOT NULL DEFAULT 1,
    "closeConfirmation" BOOLEAN NOT NULL DEFAULT true,
    "transcriptEnabled" BOOLEAN NOT NULL DEFAULT true,
    "transcriptChannelId" TEXT,
    "deleteOnClose" BOOLEAN NOT NULL DEFAULT false,
    "deleteDelaySeconds" INTEGER NOT NULL DEFAULT 10,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TicketConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "XpSettings" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "xpMin" INTEGER NOT NULL DEFAULT 15,
    "xpMax" INTEGER NOT NULL DEFAULT 25,
    "cooldownSeconds" INTEGER NOT NULL DEFAULT 60,
    "levelUpChannelId" TEXT,
    "levelUpMessage" TEXT NOT NULL DEFAULT '≡ƒÄë F├⌐licitations {user}, tu es maintenant niveau **{level}** !',
    "announceLevelUp" BOOLEAN NOT NULL DEFAULT true,
    "ignoredChannelIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "ignoredRoleIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "stackRoles" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "XpSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LevelRole" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "roleId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LevelRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserXp" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "discordUserId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "avatar" TEXT,
    "xp" INTEGER NOT NULL DEFAULT 0,
    "level" INTEGER NOT NULL DEFAULT 0,
    "messageCount" INTEGER NOT NULL DEFAULT 0,
    "lastXpAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserXp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ticket" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "creatorName" TEXT NOT NULL,
    "subject" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "closedBy" TEXT,
    "closedAt" TIMESTAMP(3),
    "reopenedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Ticket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LogEntry" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "actorId" TEXT,
    "actorName" TEXT,
    "targetId" TEXT,
    "targetName" TEXT,
    "channelId" TEXT,
    "reason" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LogEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DashboardPermission" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "discordId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "level" TEXT NOT NULL DEFAULT 'admin',
    "addedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DashboardPermission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GuildSettings_guildId_key" ON "GuildSettings"("guildId");

-- CreateIndex
CREATE UNIQUE INDEX "ModuleConfig_guildId_module_key" ON "ModuleConfig"("guildId", "module");

-- CreateIndex
CREATE UNIQUE INDEX "WelcomeConfig_guildId_key" ON "WelcomeConfig"("guildId");

-- CreateIndex
CREATE UNIQUE INDEX "TicketConfig_guildId_key" ON "TicketConfig"("guildId");

-- CreateIndex
CREATE UNIQUE INDEX "XpSettings_guildId_key" ON "XpSettings"("guildId");

-- CreateIndex
CREATE UNIQUE INDEX "LevelRole_guildId_level_key" ON "LevelRole"("guildId", "level");

-- CreateIndex
CREATE INDEX "UserXp_guildId_xp_idx" ON "UserXp"("guildId", "xp");

-- CreateIndex
CREATE UNIQUE INDEX "UserXp_guildId_discordUserId_key" ON "UserXp"("guildId", "discordUserId");

-- CreateIndex
CREATE UNIQUE INDEX "Ticket_channelId_key" ON "Ticket"("channelId");

-- CreateIndex
CREATE INDEX "Ticket_guildId_status_idx" ON "Ticket"("guildId", "status");

-- CreateIndex
CREATE INDEX "LogEntry_guildId_createdAt_idx" ON "LogEntry"("guildId", "createdAt");

-- CreateIndex
CREATE INDEX "LogEntry_guildId_type_idx" ON "LogEntry"("guildId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "DashboardPermission_guildId_discordId_key" ON "DashboardPermission"("guildId", "discordId");

-- AddForeignKey
ALTER TABLE "GuildSettings" ADD CONSTRAINT "GuildSettings_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModuleConfig" ADD CONSTRAINT "ModuleConfig_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WelcomeConfig" ADD CONSTRAINT "WelcomeConfig_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketConfig" ADD CONSTRAINT "TicketConfig_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "XpSettings" ADD CONSTRAINT "XpSettings_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LevelRole" ADD CONSTRAINT "LevelRole_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserXp" ADD CONSTRAINT "UserXp_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LogEntry" ADD CONSTRAINT "LogEntry_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DashboardPermission" ADD CONSTRAINT "DashboardPermission_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

