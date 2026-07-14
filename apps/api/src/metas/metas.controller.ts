import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";

import {
  createMetaDeckEntrySchema,
  createMetaSchema,
  type MetaDeckEntry,
  type MetaDeckEntryList,
  type MetaDetail,
  type MetaListResponse,
  metaListQuerySchema,
  updateMetaDeckEntrySchema,
  updateMetaSchema,
} from "@teambrewer/shared";

import { CurrentTeam } from "../tenancy/current-team.decorator.js";
import type { TeamContext } from "../tenancy/team-context.js";
import { TeamContextGuard } from "../tenancy/team-context.guard.js";
import { MetasService } from "./metas.service.js";

/**
 * Team-scoped meta + meta-deck-entry endpoints (docs/features/metas.md). Every
 * route is guarded by {@link TeamContextGuard}; the verified team comes from
 * `@CurrentTeam()`, never the body. Request bodies/queries are validated at the
 * boundary with the shared Zod schemas. `GET /metas/current` is declared before
 * the `:metaId` route so "current" is matched as the dedicated resolver, not an id.
 */
@Controller("metas")
@UseGuards(TeamContextGuard)
export class MetasController {
  constructor(private readonly metas: MetasService) {}

  @Get()
  list(@Query() query: unknown): Promise<MetaListResponse> {
    return this.metas.list(metaListQuerySchema.parse(query));
  }

  @Get("current")
  getCurrentMeta(): Promise<MetaDetail> {
    return this.metas.getCurrentMeta();
  }

  @Post()
  create(@CurrentTeam() team: TeamContext, @Body() body: unknown): Promise<MetaDetail> {
    return this.metas.create(team, createMetaSchema.parse(body));
  }

  @Get(":metaId")
  getMeta(@Param("metaId") metaId: string): Promise<MetaDetail> {
    return this.metas.getMeta(metaId);
  }

  @Patch(":metaId")
  update(
    @CurrentTeam() team: TeamContext,
    @Param("metaId") metaId: string,
    @Body() body: unknown,
  ): Promise<MetaDetail> {
    return this.metas.update(team, metaId, updateMetaSchema.parse(body));
  }

  @Delete(":metaId")
  @HttpCode(204)
  archive(@Param("metaId") metaId: string): Promise<void> {
    return this.metas.archive(metaId);
  }

  @Get(":metaId/deck-entries")
  listDeckEntries(@Param("metaId") metaId: string): Promise<MetaDeckEntryList> {
    return this.metas.listDeckEntries(metaId);
  }

  @Post(":metaId/deck-entries")
  addDeckEntry(
    @CurrentTeam() team: TeamContext,
    @Param("metaId") metaId: string,
    @Body() body: unknown,
  ): Promise<MetaDeckEntry> {
    return this.metas.addDeckEntry(team, metaId, createMetaDeckEntrySchema.parse(body));
  }

  @Patch(":metaId/deck-entries/:entryId")
  updateDeckEntry(
    @CurrentTeam() team: TeamContext,
    @Param("metaId") metaId: string,
    @Param("entryId") entryId: string,
    @Body() body: unknown,
  ): Promise<MetaDeckEntry> {
    return this.metas.updateDeckEntry(team, metaId, entryId, updateMetaDeckEntrySchema.parse(body));
  }

  @Delete(":metaId/deck-entries/:entryId")
  @HttpCode(204)
  removeDeckEntry(
    @Param("metaId") metaId: string,
    @Param("entryId") entryId: string,
  ): Promise<void> {
    return this.metas.removeDeckEntry(metaId, entryId);
  }
}
