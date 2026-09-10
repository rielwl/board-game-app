-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('ACTIVE', 'CANCELLED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "EventRole" AS ENUM ('ORGANIZER', 'ATTENDEE');

-- CreateEnum
CREATE TYPE "RsvpStatus" AS ENUM ('YES', 'MAYBE', 'NO', 'AWAITING');

-- CreateEnum
CREATE TYPE "GameSource" AS ENUM ('BGG', 'MANUAL');

-- CreateEnum
CREATE TYPE "TagKind" AS ENUM ('MECHANIC', 'CATEGORY');

-- CreateEnum
CREATE TYPE "Familiarity" AS ENUM ('NEVER_PLAYED', 'PLAYED', 'CAN_TEACH');

-- CreateEnum
CREATE TYPE "NoveltyPreference" AS ENUM ('FAMILIAR', 'NEW', 'EITHER');

-- CreateEnum
CREATE TYPE "SelectionMethod" AS ENUM ('MANUAL', 'PICK_FOR_US');

-- CreateTable
CREATE TABLE "user" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "bggUsername" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "idToken" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "location" TEXT NOT NULL,
    "attendeeNotes" TEXT,
    "maxAttendees" INTEGER,
    "status" "EventStatus" NOT NULL DEFAULT 'ACTIVE',
    "targetPlayerCount" INTEGER,
    "maxDurationMinutes" INTEGER,
    "complexityTarget" DOUBLE PRECISION,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventMember" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "EventRole" NOT NULL DEFAULT 'ATTENDEE',
    "rsvp" "RsvpStatus" NOT NULL DEFAULT 'AWAITING',
    "rsvpNote" TEXT,
    "respondedAt" TIMESTAMP(3),
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invite" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "tokenCipher" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "maxUses" INTEGER,
    "useCount" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Game" (
    "id" TEXT NOT NULL,
    "bggId" INTEGER,
    "bggUrl" TEXT,
    "source" "GameSource" NOT NULL DEFAULT 'MANUAL',
    "name" TEXT NOT NULL,
    "yearPublished" INTEGER,
    "imageUrl" TEXT,
    "thumbnailUrl" TEXT,
    "minPlayers" INTEGER,
    "maxPlayers" INTEGER,
    "playingTime" INTEGER,
    "minPlayTime" INTEGER,
    "maxPlayTime" INTEGER,
    "minAge" INTEGER,
    "averageRating" DOUBLE PRECISION,
    "bayesRating" DOUBLE PRECISION,
    "usersRated" INTEGER,
    "averageWeight" DOUBLE PRECISION,
    "numWeightVotes" INTEGER,
    "isExpansion" BOOLEAN NOT NULL DEFAULT false,
    "lastFetchedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Game_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tag" (
    "id" TEXT NOT NULL,
    "kind" "TagKind" NOT NULL,
    "name" TEXT NOT NULL,
    "bggTagId" INTEGER,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameTag" (
    "gameId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,

    CONSTRAINT "GameTag_pkey" PRIMARY KEY ("gameId","tagId")
);

-- CreateTable
CREATE TABLE "GamePlayerPoll" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "playerCount" INTEGER NOT NULL,
    "best" INTEGER NOT NULL DEFAULT 0,
    "recommended" INTEGER NOT NULL DEFAULT 0,
    "notRecommended" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "GamePlayerPoll_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameRelation" (
    "id" TEXT NOT NULL,
    "expansionId" TEXT NOT NULL,
    "baseGameId" TEXT NOT NULL,

    CONSTRAINT "GameRelation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserGame" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "available" BOOLEAN NOT NULL DEFAULT true,
    "familiarity" "Familiarity" NOT NULL DEFAULT 'NEVER_PLAYED',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserGame_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventGameOffer" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventGameOffer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventPreference" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "minComplexity" DOUBLE PRECISION,
    "maxComplexity" DOUBLE PRECISION,
    "maxPlayTime" INTEGER,
    "noveltyPreference" "NoveltyPreference" NOT NULL DEFAULT 'EITHER',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameRequest" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GameRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventSelection" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "primaryGameId" TEXT NOT NULL,
    "backup1GameId" TEXT,
    "backup2GameId" TEXT,
    "method" "SelectionMethod" NOT NULL DEFAULT 'MANUAL',
    "notes" TEXT,
    "primaryScoreSnapshot" DOUBLE PRECISION,
    "selectedById" TEXT NOT NULL,
    "lockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventSelection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateLimitHit" (
    "id" TEXT NOT NULL,
    "bucket" TEXT NOT NULL,
    "windowKey" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateLimitHit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE UNIQUE INDEX "session_token_key" ON "session"("token");

-- CreateIndex
CREATE INDEX "session_userId_idx" ON "session"("userId");

-- CreateIndex
CREATE INDEX "session_expiresAt_idx" ON "session"("expiresAt");

-- CreateIndex
CREATE INDEX "account_userId_idx" ON "account"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "account_providerId_accountId_key" ON "account"("providerId", "accountId");

-- CreateIndex
CREATE INDEX "verification_identifier_idx" ON "verification"("identifier");

-- CreateIndex
CREATE INDEX "Event_createdById_idx" ON "Event"("createdById");

-- CreateIndex
CREATE INDEX "Event_startsAt_idx" ON "Event"("startsAt");

-- CreateIndex
CREATE INDEX "Event_status_idx" ON "Event"("status");

-- CreateIndex
CREATE INDEX "EventMember_userId_idx" ON "EventMember"("userId");

-- CreateIndex
CREATE INDEX "EventMember_eventId_rsvp_idx" ON "EventMember"("eventId", "rsvp");

-- CreateIndex
CREATE UNIQUE INDEX "EventMember_eventId_userId_key" ON "EventMember"("eventId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Invite_tokenHash_key" ON "Invite"("tokenHash");

-- CreateIndex
CREATE INDEX "Invite_eventId_idx" ON "Invite"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "Game_bggId_key" ON "Game"("bggId");

-- CreateIndex
CREATE INDEX "Game_name_idx" ON "Game"("name");

-- CreateIndex
CREATE INDEX "Game_isExpansion_idx" ON "Game"("isExpansion");

-- CreateIndex
CREATE INDEX "Game_lastFetchedAt_idx" ON "Game"("lastFetchedAt");

-- CreateIndex
CREATE INDEX "Tag_kind_idx" ON "Tag"("kind");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_kind_name_key" ON "Tag"("kind", "name");

-- CreateIndex
CREATE INDEX "GameTag_tagId_idx" ON "GameTag"("tagId");

-- CreateIndex
CREATE UNIQUE INDEX "GamePlayerPoll_gameId_playerCount_key" ON "GamePlayerPoll"("gameId", "playerCount");

-- CreateIndex
CREATE INDEX "GameRelation_baseGameId_idx" ON "GameRelation"("baseGameId");

-- CreateIndex
CREATE UNIQUE INDEX "GameRelation_expansionId_baseGameId_key" ON "GameRelation"("expansionId", "baseGameId");

-- CreateIndex
CREATE INDEX "UserGame_gameId_idx" ON "UserGame"("gameId");

-- CreateIndex
CREATE UNIQUE INDEX "UserGame_userId_gameId_key" ON "UserGame"("userId", "gameId");

-- CreateIndex
CREATE INDEX "EventGameOffer_eventId_gameId_idx" ON "EventGameOffer"("eventId", "gameId");

-- CreateIndex
CREATE INDEX "EventGameOffer_userId_idx" ON "EventGameOffer"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "EventGameOffer_eventId_userId_gameId_key" ON "EventGameOffer"("eventId", "userId", "gameId");

-- CreateIndex
CREATE INDEX "EventPreference_userId_idx" ON "EventPreference"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "EventPreference_eventId_userId_key" ON "EventPreference"("eventId", "userId");

-- CreateIndex
CREATE INDEX "GameRequest_eventId_gameId_idx" ON "GameRequest"("eventId", "gameId");

-- CreateIndex
CREATE UNIQUE INDEX "GameRequest_eventId_userId_gameId_key" ON "GameRequest"("eventId", "userId", "gameId");

-- CreateIndex
CREATE UNIQUE INDEX "EventSelection_eventId_key" ON "EventSelection"("eventId");

-- CreateIndex
CREATE INDEX "EventSelection_selectedById_idx" ON "EventSelection"("selectedById");

-- CreateIndex
CREATE INDEX "RateLimitHit_expiresAt_idx" ON "RateLimitHit"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "RateLimitHit_bucket_windowKey_key" ON "RateLimitHit"("bucket", "windowKey");

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account" ADD CONSTRAINT "account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventMember" ADD CONSTRAINT "EventMember_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventMember" ADD CONSTRAINT "EventMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invite" ADD CONSTRAINT "Invite_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invite" ADD CONSTRAINT "Invite_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Game" ADD CONSTRAINT "Game_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameTag" ADD CONSTRAINT "GameTag_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameTag" ADD CONSTRAINT "GameTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GamePlayerPoll" ADD CONSTRAINT "GamePlayerPoll_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameRelation" ADD CONSTRAINT "GameRelation_expansionId_fkey" FOREIGN KEY ("expansionId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameRelation" ADD CONSTRAINT "GameRelation_baseGameId_fkey" FOREIGN KEY ("baseGameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserGame" ADD CONSTRAINT "UserGame_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserGame" ADD CONSTRAINT "UserGame_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventGameOffer" ADD CONSTRAINT "EventGameOffer_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventGameOffer" ADD CONSTRAINT "EventGameOffer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventGameOffer" ADD CONSTRAINT "EventGameOffer_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventPreference" ADD CONSTRAINT "EventPreference_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventPreference" ADD CONSTRAINT "EventPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameRequest" ADD CONSTRAINT "GameRequest_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameRequest" ADD CONSTRAINT "GameRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameRequest" ADD CONSTRAINT "GameRequest_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventSelection" ADD CONSTRAINT "EventSelection_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventSelection" ADD CONSTRAINT "EventSelection_selectedById_fkey" FOREIGN KEY ("selectedById") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventSelection" ADD CONSTRAINT "EventSelection_primaryGameId_fkey" FOREIGN KEY ("primaryGameId") REFERENCES "Game"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventSelection" ADD CONSTRAINT "EventSelection_backup1GameId_fkey" FOREIGN KEY ("backup1GameId") REFERENCES "Game"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventSelection" ADD CONSTRAINT "EventSelection_backup2GameId_fkey" FOREIGN KEY ("backup2GameId") REFERENCES "Game"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
