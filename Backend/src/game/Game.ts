import { GameError } from './errors.js';
import { isWolf } from './roles.js';
import {
  NIGHT_PHASES,
  POWER_ROLES,
  type Composition,
  type DeathCause,
  type GameAction,
  type GameSettings,
  type GameView,
  type LogEntry,
  type NightPhase,
  type PendingAction,
  type Phase,
  type PlayerView,
  type PrivateEntry,
  type PublicDeath,
  type PublicDeathCause,
  type Role,
  type WinningSide,
  VOTE_COUNTDOWN_SECONDS,
} from './types.js';

export interface GamePlayerInit {
  id: string;
  name: string;
  role: Role;
}

export interface GameOptions {
  /** Generador aleatorio en [0, 1). Se inyecta para poder hacer tests deterministas. */
  rng?: () => number;
  /** Reloj en ms. Se inyecta para los tests. */
  now?: () => number;
  /**
   * Lo que se anuncia del reparto. Lo calcula `createGame`; si no se pasa
   * (en los tests), se usa el reparto exacto.
   */
  composition?: Composition;
}

interface GamePlayer extends GamePlayerInit {
  alive: boolean;
  loverId: string | null;
}

interface Death {
  playerId: string;
  cause: DeathCause;
  role: Role;
}

interface NightState {
  wolfVotes: Map<string, string>;
  victimId: string | null;
  protectedId: string | null;
  /** A quién ha mirado la carta la vidente (se le avisa al amanecer). */
  seenId: string | null;
  healed: boolean;
  poisonedId: string | null;
}

type StepStatus = 'skip' | 'active' | 'phantom';
type Resume = 'day' | 'night';

const newNight = (): NightState => ({
  wolfVotes: new Map(),
  victimId: null,
  protectedId: null,
  seenId: null,
  healed: false,
  poisonedId: null,
});

/** Claves con más votos (puede haber empate). */
function leaders<K>(tally: Map<K, number>): K[] {
  let max = 0;
  let out: K[] = [];
  for (const [key, count] of tally) {
    if (count > max) {
      max = count;
      out = [key];
    } else if (count === max) {
      out.push(key);
    }
  }
  return out;
}

/**
 * Motor de una partida del Lobo.
 *
 * Es una máquina de estados pura: no sabe nada de sockets ni de temporizadores.
 * Quien la usa (la `Room`) llama a `act()` cuando un jugador hace algo y a
 * `timeout()` cuando vence el tiempo de la fase actual (`nextTimeoutAt`).
 */
export class Game {
  readonly settings: GameSettings;
  private readonly composition: Composition;
  private readonly players: GamePlayer[];
  private readonly byId: Map<string, GamePlayer>;
  private readonly rng: () => number;
  private readonly now: () => number;

  private started = false;
  private _phase: Phase = 'night_cupid';
  private _phaseId = 0;
  private _night = 0;
  private _day = 0;
  /** Fin "oficial" de la fase, el que ven los jugadores. */
  private endsAt: number | null = null;
  /** Fin normal de la fase, sin la cuenta atrás de "pasar a votar". */
  private regularEndsAt: number | null = null;
  /** Cuándo hay que llamar a timeout(); en pasos fantasma es antes que endsAt. */
  private deadline: number | null = null;
  /** El rol de este paso nocturno está muerto: nadie actúa, solo se simula. */
  private phantom = false;

  private nightState: NightState = newNight();
  private lastProtectedId: string | null = null;
  private healPotion = true;
  private poisonPotion = true;
  private readonly dayVotes = new Map<string, string | null>();
  private readonly readyIds = new Set<string>();
  private readonly pendingHunters: string[] = [];
  private resumeTo: Resume = 'day';

  private readonly log: LogEntry[] = [];
  private readonly privateLogs = new Map<string, PrivateEntry[]>();
  private winner: { side: WinningSide; playerIds: string[] } | null = null;

  constructor(players: GamePlayerInit[], settings: GameSettings, options: GameOptions = {}) {
    if (new Set(players.map((p) => p.id)).size !== players.length) {
      throw new Error('IDs de jugador duplicados');
    }
    this.settings = structuredClone(settings);
    this.players = players.map((p) => ({ ...p, alive: true, loverId: null }));
    this.byId = new Map(this.players.map((p) => [p.id, p]));
    this.rng = options.rng ?? Math.random;
    this.now = options.now ?? Date.now;
    this.composition = structuredClone(options.composition ?? this.exactComposition());
  }

  private exactComposition(): Composition {
    const wolves = this.players.filter((p) => isWolf(p.role)).length;
    const powers: Composition['powers'] = {};
    for (const role of POWER_ROLES) {
      const n = this.players.filter((p) => p.role === role).length;
      if (n > 0) powers[role] = n;
    }
    return { powers, wolves: { min: wolves, max: wolves } };
  }

  // -------------------------------------------------------------------------
  // Consultas
  // -------------------------------------------------------------------------

  get phase(): Phase {
    return this._phase;
  }

  get phaseId(): number {
    return this._phaseId;
  }

  get night(): number {
    return this._night;
  }

  get day(): number {
    return this._day;
  }

  get isOver(): boolean {
    return this._phase === 'ended';
  }

  /** Momento (ms) en el que hay que llamar a `timeout()`. `null` si la partida ha terminado. */
  get nextTimeoutAt(): number | null {
    return this.deadline;
  }

  playerInfo(id: string): { alive: boolean; role: Role; pendingShot: boolean } | null {
    const p = this.byId.get(id);
    return p ? { alive: p.alive, role: p.role, pendingShot: this.hasPendingShot(p) } : null;
  }

  /**
   * Cazador muerto que aún no ha disparado. Hasta que dispare (o pierda el
   * disparo) no recibe la información de los muertos: si no, sabría a quién apuntar.
   */
  private hasPendingShot(p: GamePlayer): boolean {
    return !p.alive && this.pendingHunters.includes(p.id);
  }

  // -------------------------------------------------------------------------
  // API pública
  // -------------------------------------------------------------------------

  start(): void {
    if (this.started) throw new GameError('already_started', 'La partida ya ha empezado.');
    this.started = true;
    this.beginNight();
  }

  /** Aplica la acción de un jugador. Lanza `GameError` si no es válida. */
  act(playerId: string, action: GameAction): void {
    if (!this.started) throw new GameError('not_started', 'La partida no ha empezado.');
    if (this._phase === 'ended') throw new GameError('game_over', 'La partida ha terminado.');
    const p = this.byId.get(playerId);
    if (!p) throw new GameError('not_in_game', 'No participas en esta partida.');

    switch (action.type) {
      case 'cupid':
        return this.actCupid(p, action.targets);
      case 'protect':
        return this.actProtect(p, action.target);
      case 'see':
        return this.actSee(p, action.target);
      case 'wolf_vote':
        return this.actWolfVote(p, action.target);
      case 'witch':
        return this.actWitch(p, action.heal, action.poison);
      case 'shoot':
        return this.actShoot(p, action.target);
      case 'vote':
        return this.actVote(p, action.target);
      case 'ready':
        return this.actReady(p, action.ready);
      default:
        throw new GameError('unknown_action', 'Acción desconocida.');
    }
  }

  /**
   * Se acabó el tiempo de la fase `phaseId`. Si la fase ya ha cambiado
   * (porque los jugadores actuaron antes) no hace nada y devuelve `false`.
   */
  timeout(phaseId: number = this._phaseId): boolean {
    if (!this.started || phaseId !== this._phaseId || this._phase === 'ended') return false;

    switch (this._phase) {
      case 'night_wolves':
        this.setVictim(this.pickWolfVictim());
        this.nextNightStep();
        break;
      case 'night_cupid':
      case 'night_protector':
      case 'night_seer':
      case 'night_witch':
        this.nextNightStep();
        break;
      case 'dawn':
        this.afterDeaths('day');
        break;
      case 'dusk':
        this.afterDeaths('night');
        break;
      case 'hunter': {
        // El cazador no ha disparado a tiempo: pierde el disparo.
        const hunterId = this.pendingHunters.shift();
        if (hunterId) this.log.push({ kind: 'hunter_shot', hunterId, targetId: null, deaths: [] });
        this.afterDeaths(this.resumeTo);
        break;
      }
      case 'day_discussion':
        this.enterPhase('day_vote');
        break;
      case 'day_vote':
        this.resolveVote();
        break;
    }
    return true;
  }

  /** Estado de la partida tal y como lo ve `viewerId` (sin información secreta ajena). */
  viewFor(viewerId: string | null): GameView {
    const me = viewerId ? (this.byId.get(viewerId) ?? null) : null;
    const omniscient =
      this._phase === 'ended' ||
      (me !== null && !me.alive && !this.hasPendingShot(me) && this.settings.deadSeeEverything);
    const known = this.knownRoles(me);

    const players: PlayerView[] = this.players.map((p) => ({
      id: p.id,
      name: p.name,
      alive: p.alive,
      role: omniscient || (!p.alive && this.settings.revealRoleOnDeath) ? p.role : (known.get(p.id) ?? null),
      lover: this.loverVisibility(p, me, omniscient),
    }));

    return {
      phase: this._phase,
      phaseId: this._phaseId,
      endsAt: this.endsAt,
      night: this._night,
      day: this._day,
      composition: structuredClone(this.composition),
      me: me
        ? { id: me.id, role: me.role, alive: me.alive, loverId: me.loverId, pendingShot: this.hasPendingShot(me) }
        : null,
      players,
      action: this.pendingActionFor(me),
      votes: this._phase === 'day_vote' ? Object.fromEntries(this.dayVotes) : null,
      readyIds: this._phase === 'day_discussion' ? [...this.readyIds] : null,
      hunterId: this._phase === 'hunter' ? (this.pendingHunters[0] ?? null) : null,
      log: [...this.log],
      privateLog: me ? [...(this.privateLogs.get(me.id) ?? [])] : [],
      winner: this.winner,
    };
  }

  // -------------------------------------------------------------------------
  // Acciones
  // -------------------------------------------------------------------------

  private actCupid(p: GamePlayer, targets: [string, string]): void {
    this.assertNightTurn(p, 'night_cupid', p.role === 'cupid');
    const a = this.aliveTarget(targets[0]);
    const b = this.aliveTarget(targets[1]);
    if (a.id === b.id) throw new GameError('invalid_target', 'Tienes que elegir a dos jugadores distintos.');

    a.loverId = b.id;
    b.loverId = a.id;
    this.addPrivate(a.id, { kind: 'lovers', partnerId: b.id, partnerRole: b.role });
    this.addPrivate(b.id, { kind: 'lovers', partnerId: a.id, partnerRole: a.role });
    this.addPrivate(p.id, { kind: 'cupid', loverIds: [a.id, b.id] });
    this.nextNightStep();
  }

  private actProtect(p: GamePlayer, targetId: string): void {
    this.assertNightTurn(p, 'night_protector', p.role === 'protector');
    const t = this.aliveTarget(targetId);
    if (t.id === this.lastProtectedId) {
      throw new GameError('invalid_target', 'No puedes proteger a la misma persona dos noches seguidas.');
    }
    this.nightState.protectedId = t.id;
    this.addPrivate(p.id, { kind: 'protected', night: this._night, targetId: t.id });
    this.nextNightStep();
  }

  private actSee(p: GamePlayer, targetId: string): void {
    this.assertNightTurn(p, 'night_seer', p.role === 'seer');
    const t = this.aliveTarget(targetId);
    if (t.id === p.id) throw new GameError('invalid_target', 'No puedes mirar tu propia carta.');
    this.addPrivate(p.id, { kind: 'vision', night: this._night, targetId: t.id, role: t.role });
    this.nightState.seenId = t.id;
    this.nextNightStep();
  }

  private actWolfVote(p: GamePlayer, targetId: string): void {
    this.assertNightTurn(p, 'night_wolves', isWolf(p.role));
    const t = this.aliveTarget(targetId);
    if (isWolf(t.role)) throw new GameError('invalid_target', 'Los lobos no pueden atacar a otro lobo.');

    this.nightState.wolfVotes.set(p.id, t.id);
    // Si todos los lobos vivos están de acuerdo, no hace falta esperar al final del tiempo.
    const wolves = this.alivePlayers().filter((w) => isWolf(w.role));
    if (wolves.every((w) => this.nightState.wolfVotes.get(w.id) === t.id)) {
      this.setVictim(t.id);
      this.nextNightStep();
    }
  }

  private actWitch(p: GamePlayer, heal: boolean, poison: string | null): void {
    this.assertNightTurn(p, 'night_witch', p.role === 'witch');
    const ns = this.nightState;
    if (heal && (!this.healPotion || !ns.victimId)) {
      throw new GameError('invalid_action', 'No puedes usar la poción de vida.');
    }
    let poisoned: GamePlayer | null = null;
    if (poison !== null) {
      if (!this.poisonPotion) throw new GameError('invalid_action', 'Ya has usado la poción de muerte.');
      poisoned = this.aliveTarget(poison);
      if (poisoned.id === p.id) throw new GameError('invalid_target', 'No puedes usar la poción de muerte contigo.');
    }

    if (heal) {
      ns.healed = true;
      this.healPotion = false;
    }
    if (poisoned) {
      ns.poisonedId = poisoned.id;
      this.poisonPotion = false;
    }
    this.addPrivate(p.id, {
      kind: 'witch',
      night: this._night,
      healedId: heal ? ns.victimId : null,
      poisonedId: poisoned?.id ?? null,
    });
    this.nextNightStep();
  }

  private actShoot(p: GamePlayer, targetId: string): void {
    if (this._phase !== 'hunter' || this.pendingHunters[0] !== p.id) {
      throw new GameError('not_your_turn', 'No es tu turno.');
    }
    const t = this.aliveTarget(targetId);
    this.pendingHunters.shift();
    const deaths = this.killAll([[t.id, 'hunter']]);
    this.log.push({
      kind: 'hunter_shot',
      hunterId: p.id,
      targetId: t.id,
      deaths: deaths.map((d) => this.publicDeath(d, false)),
    });
    this.afterDeaths(this.resumeTo);
  }

  private actVote(p: GamePlayer, targetId: string | null): void {
    if (this._phase !== 'day_vote' || !p.alive) throw new GameError('not_your_turn', 'No puedes votar ahora.');
    if (targetId !== null) this.aliveTarget(targetId);
    this.dayVotes.set(p.id, targetId);
    if (this.alivePlayers().every((a) => this.dayVotes.has(a.id))) this.resolveVote();
  }

  /**
   * Pedir (o dejar de pedir) que se vote ya. Si lo piden todos se vota al
   * momento; si lo piden más de la mitad, el debate acaba tras una cuenta atrás
   * corta, que se cancela si dejan de ser mayoría.
   */
  private actReady(p: GamePlayer, ready: boolean): void {
    if (this._phase !== 'day_discussion' || !p.alive) throw new GameError('not_your_turn', 'Ahora no se puede.');
    if (ready) this.readyIds.add(p.id);
    else this.readyIds.delete(p.id);

    const alive = this.alivePlayers().length;
    if (this.readyIds.size >= alive) {
      this.enterPhase('day_vote');
      return;
    }
    const regular = this.regularEndsAt ?? this.now();
    let endsAt = regular;
    if (this.readyIds.size * 2 > alive) {
      // Si la cuenta atrás ya estaba en marcha, sigue; si no, empieza ahora.
      const running = this.endsAt !== null && this.endsAt < regular;
      endsAt = running ? (this.endsAt as number) : Math.min(regular, this.now() + VOTE_COUNTDOWN_SECONDS * 1000);
    }
    this.endsAt = endsAt;
    this.deadline = endsAt;
  }

  // -------------------------------------------------------------------------
  // Flujo de la noche
  // -------------------------------------------------------------------------

  private beginNight(): void {
    this._night++;
    this.nightState = newNight();
    this.log.push({ kind: 'night_start', night: this._night });
    this.deliverGifts();
    this.enterNightStep(0);
  }

  /**
   * Papá Noel no tiene turno: al caer la noche descubre la carta de un
   * jugador vivo al azar (que no sea él). Puede tocarle la misma persona varias veces.
   */
  private deliverGifts(): void {
    for (const santa of this.alivePlayers().filter((p) => p.role === 'santa')) {
      const others = this.alivePlayers().filter((p) => p.id !== santa.id);
      if (others.length === 0) continue;
      const t = this.pick(others);
      this.addPrivate(santa.id, { kind: 'gift', night: this._night, targetId: t.id, role: t.role });
    }
  }

  private nextNightStep(): void {
    const idx = NIGHT_PHASES.indexOf(this._phase as NightPhase);
    if (idx < 0) throw new Error(`nextNightStep llamado fuera de la noche (${this._phase})`);
    this.enterNightStep(idx + 1);
  }

  private enterNightStep(from: number): void {
    for (let i = from; i < NIGHT_PHASES.length; i++) {
      const step = NIGHT_PHASES[i] as NightPhase;
      const status = this.stepStatus(step);
      if (status !== 'skip') {
        this.enterPhase(step, status === 'phantom');
        return;
      }
    }
    this.resolveNight();
  }

  /**
   * - `skip`: el rol no está en la partida (la composición es pública, así que no se revela nada).
   * - `phantom`: el rol está en la partida pero no puede actuar (muerto, o bruja sin pociones).
   *   El paso se muestra igual para no dar pistas, y termina tras un tiempo aleatorio.
   */
  private stepStatus(step: NightPhase): StepStatus {
    switch (step) {
      case 'night_cupid':
        return this._night === 1 ? this.roleStatus('cupid') : 'skip';
      case 'night_protector':
        return this.roleStatus('protector');
      case 'night_seer':
        return this.roleStatus('seer');
      case 'night_wolves':
        return 'active';
      case 'night_witch': {
        const status = this.roleStatus('witch');
        return status === 'active' && !this.healPotion && !this.poisonPotion ? 'phantom' : status;
      }
    }
  }

  private roleStatus(role: Role): StepStatus {
    const holders = this.players.filter((p) => p.role === role);
    if (holders.length === 0) return 'skip';
    return holders.some((p) => p.alive) ? 'active' : 'phantom';
  }

  private setVictim(id: string | null): void {
    this.nightState.victimId = id;
    for (const w of this.alivePlayers()) {
      if (isWolf(w.role)) this.addPrivate(w.id, { kind: 'wolves_victim', night: this._night, targetId: id });
    }
  }

  /** Al acabar el tiempo de los lobos: el más votado; si hay empate, al azar entre los empatados. */
  private pickWolfVictim(): string | null {
    const tally = new Map<string, number>();
    for (const t of this.nightState.wolfVotes.values()) tally.set(t, (tally.get(t) ?? 0) + 1);
    const top = leaders(tally);
    return top.length > 0 ? this.pick(top) : null;
  }

  private resolveNight(): void {
    const ns = this.nightState;
    const kills: [string, DeathCause][] = [];
    if (ns.victimId && ns.victimId !== ns.protectedId && !ns.healed) kills.push([ns.victimId, 'wolves']);
    if (ns.poisonedId) kills.push([ns.poisonedId, 'poison']);
    this.lastProtectedId = ns.protectedId;
    if (ns.seenId) this.addPrivate(ns.seenId, { kind: 'seen', night: this._night });

    const deaths = this.killAll(kills);
    this._day++;
    this.log.push({ kind: 'dawn', day: this._day, deaths: deaths.map((d) => this.publicDeath(d, true)) });
    this.enterPhase('dawn');
  }

  // -------------------------------------------------------------------------
  // Flujo del día
  // -------------------------------------------------------------------------

  /** Mayoría simple. El voto en blanco cuenta como una opción más; los empates salvan a todos. */
  private resolveVote(): void {
    const tally = new Map<string | null, number>();
    for (const target of this.dayVotes.values()) tally.set(target, (tally.get(target) ?? 0) + 1);
    const top = leaders(tally);
    const lynchedId = top.length === 1 ? (top[0] ?? null) : null;

    const deaths = lynchedId ? this.killAll([[lynchedId, 'lynch']]) : [];
    this.log.push({
      kind: 'vote_result',
      day: this._day,
      votes: Object.fromEntries(this.dayVotes),
      lynchedId,
      deaths: deaths.map((d) => this.publicDeath(d, false)),
    });
    this.enterPhase('dusk');
  }

  // -------------------------------------------------------------------------
  // Muertes y final de partida
  // -------------------------------------------------------------------------

  /** Mata a los jugadores indicados y propaga las muertes por amor. Marca cazadores pendientes. */
  private killAll(initial: [string, DeathCause][]): Death[] {
    const out: Death[] = [];
    const queue = [...initial];
    while (queue.length > 0) {
      const [id, cause] = queue.shift() as [string, DeathCause];
      const p = this.byId.get(id);
      if (!p || !p.alive) continue;
      p.alive = false;
      out.push({ playerId: p.id, cause, role: p.role });
      if (p.role === 'hunter') this.pendingHunters.push(p.id);
      if (p.loverId && this.byId.get(p.loverId)?.alive) queue.push([p.loverId, 'grief']);
    }
    return out;
  }

  /** Tras anunciar muertes: primero disparan los cazadores, luego se mira si alguien ha ganado. */
  private afterDeaths(next: Resume): void {
    this.resumeTo = next;
    if (this.alivePlayers().length === 0) this.pendingHunters.length = 0;
    if (this.pendingHunters.length > 0) {
      this.enterPhase('hunter');
      return;
    }
    const side = this.checkWin();
    if (side) {
      this.finish(side);
      return;
    }
    if (next === 'day') this.enterPhase('day_discussion');
    else this.beginNight();
  }

  /**
   * - Si no queda nadie vivo es empate (p. ej. el cazador, último aldeano, se
   *   lleva por delante al último lobo).
   * - Una pareja mixta gana si son los dos últimos.
   * - Si no queda ningún lobo, gana el pueblo.
   * - Los lobos ganan en cuanto son al menos tantos como el resto, porque ya
   *   controlan la votación. Salvo que al pueblo le quede algún poder con el
   *   que darle la vuelta (ver `villageCanTurnItAround`).
   */
  private checkWin(): WinningSide | null {
    const alive = this.alivePlayers();
    if (alive.length === 0) return 'draw';
    if (alive.length === 2) {
      const [a, b] = alive as [GamePlayer, GamePlayer];
      if (a.loverId === b.id && isWolf(a.role) !== isWolf(b.role)) return 'lovers';
    }
    if (!alive.some((p) => isWolf(p.role))) return 'village';
    // Un lobo enamorado de alguien del pueblo ya no juega con la manada.
    const pack = alive.filter((p) => this.sideOf(p) === 'wolves').length;
    if (pack * 2 >= alive.length && !this.villageCanTurnItAround(alive)) return 'wolves';
    return null;
  }

  /**
   * Poderes con los que el pueblo aún puede ganar aunque los lobos sean
   * mayoría: el cazador (dispara al morir), la bruja si le queda alguna poción
   * y el protector.
   */
  private villageCanTurnItAround(alive: GamePlayer[]): boolean {
    return alive.some(
      (p) =>
        p.role === 'hunter' || p.role === 'protector' || (p.role === 'witch' && (this.healPotion || this.poisonPotion)),
    );
  }

  private finish(side: WinningSide): void {
    const playerIds = this.players.filter((p) => this.sideOf(p) === side).map((p) => p.id);
    this.winner = { side, playerIds };
    this.log.push({ kind: 'game_over', winner: side, winnerIds: playerIds });
    this.enterPhase('ended');
  }

  /** Bando real de un jugador: los enamorados de bandos distintos forman su propio bando. */
  private sideOf(p: GamePlayer): WinningSide {
    const partner = p.loverId ? this.byId.get(p.loverId) : undefined;
    if (partner && isWolf(partner.role) !== isWolf(p.role)) return 'lovers';
    return isWolf(p.role) ? 'wolves' : 'village';
  }

  // -------------------------------------------------------------------------
  // Utilidades
  // -------------------------------------------------------------------------

  private enterPhase(phase: Phase, phantom = false): void {
    this._phase = phase;
    this.phantom = phantom;
    this._phaseId++;
    if (phase === 'day_vote') this.dayVotes.clear();
    if (phase === 'day_discussion') this.readyIds.clear();
    if (phase === 'ended') {
      this.endsAt = null;
      this.regularEndsAt = null;
      this.deadline = null;
      return;
    }
    const now = this.now();
    const real = this.durationOf(phase) * 1000;
    this.endsAt = now + real;
    this.regularEndsAt = this.endsAt;
    // En un paso fantasma el contador público es el normal, pero acaba antes (como si el rol hubiese actuado).
    this.deadline = phantom ? now + Math.min(real, this.phantomDelayMs()) : this.endsAt;
  }

  private durationOf(phase: Phase): number {
    const d = this.settings.durations;
    switch (phase) {
      case 'night_wolves':
        return d.wolves;
      case 'night_cupid':
      case 'night_protector':
      case 'night_seer':
      case 'night_witch':
        return d.nightAction;
      case 'dawn':
      case 'dusk':
        return d.announcement;
      case 'hunter':
        return d.hunter;
      case 'day_discussion':
        return d.discussion;
      case 'day_vote':
        return d.vote;
      case 'ended':
        return 0;
    }
  }

  private phantomDelayMs(): number {
    const { phantomMin, phantomMax } = this.settings.durations;
    return (phantomMin + this.rng() * (phantomMax - phantomMin)) * 1000;
  }

  private pendingActionFor(me: GamePlayer | null): PendingAction | null {
    if (!me || this._phase === 'ended') return null;
    const alive = this.alivePlayers();
    const aliveIds = alive.map((p) => p.id);

    // El cazador actúa estando ya muerto.
    if (this._phase === 'hunter') {
      return this.pendingHunters[0] === me.id ? { type: 'shoot', targets: aliveIds } : null;
    }
    if (!me.alive || this.phantom) return null;

    switch (this._phase) {
      case 'night_cupid':
        return me.role === 'cupid' ? { type: 'cupid', targets: aliveIds } : null;
      case 'night_protector':
        return me.role === 'protector'
          ? {
              type: 'protect',
              targets: aliveIds.filter((id) => id !== this.lastProtectedId),
              forbiddenId: this.lastProtectedId,
            }
          : null;
      case 'night_seer':
        return me.role === 'seer' ? { type: 'see', targets: aliveIds.filter((id) => id !== me.id) } : null;
      case 'night_wolves':
        return isWolf(me.role)
          ? {
              type: 'wolf_vote',
              targets: alive.filter((p) => !isWolf(p.role)).map((p) => p.id),
              votes: Object.fromEntries(this.nightState.wolfVotes),
            }
          : null;
      case 'night_witch':
        return me.role === 'witch'
          ? {
              type: 'witch',
              victimId: this.nightState.victimId,
              canHeal: this.healPotion && this.nightState.victimId !== null,
              canPoison: this.poisonPotion,
              targets: aliveIds.filter((id) => id !== me.id),
            }
          : null;
      case 'day_discussion':
        return { type: 'ready', ready: this.readyIds.has(me.id) };
      case 'day_vote':
        return {
          type: 'vote',
          targets: aliveIds,
          hasVoted: this.dayVotes.has(me.id),
          myVote: this.dayVotes.get(me.id) ?? null,
        };
      default:
        return null;
    }
  }

  /**
   * Roles que conoce un jugador vivo: el suyo, el de los otros lobos, el de su
   * pareja, lo que ha visto la vidente y los regalos de Papá Noel.
   */
  private knownRoles(me: GamePlayer | null): Map<string, Role> {
    const known = new Map<string, Role>();
    if (!me) return known;
    known.set(me.id, me.role);
    if (isWolf(me.role)) {
      for (const p of this.players) if (isWolf(p.role)) known.set(p.id, p.role);
    }
    const partner = me.loverId ? this.byId.get(me.loverId) : undefined;
    if (partner) known.set(partner.id, partner.role);
    for (const entry of this.privateLogs.get(me.id) ?? []) {
      if (entry.kind === 'vision' || entry.kind === 'gift') known.set(entry.targetId, entry.role);
    }
    return known;
  }

  private loverVisibility(p: GamePlayer, me: GamePlayer | null, omniscient: boolean): boolean | null {
    if (omniscient || me?.role === 'cupid') return p.loverId !== null;
    if (me?.loverId && (p.id === me.id || p.id === me.loverId)) return true;
    return null;
  }

  private publicDeath(d: Death, atNight: boolean): PublicDeath {
    const cause: PublicDeathCause = atNight || d.cause === 'wolves' || d.cause === 'poison' ? 'night' : d.cause;
    return { playerId: d.playerId, cause, role: this.settings.revealRoleOnDeath ? d.role : null };
  }

  private assertNightTurn(p: GamePlayer, phase: NightPhase, hasRole: boolean): void {
    if (this._phase !== phase || this.phantom || !p.alive || !hasRole) {
      throw new GameError('not_your_turn', 'No es tu turno.');
    }
  }

  private aliveTarget(id: string): GamePlayer {
    const t = this.byId.get(id);
    if (!t || !t.alive) throw new GameError('invalid_target', 'Ese jugador no es un objetivo válido.');
    return t;
  }

  private alivePlayers(): GamePlayer[] {
    return this.players.filter((p) => p.alive);
  }

  private addPrivate(playerId: string, entry: PrivateEntry): void {
    const list = this.privateLogs.get(playerId);
    if (list) list.push(entry);
    else this.privateLogs.set(playerId, [entry]);
  }

  private pick<T>(items: T[]): T {
    return items[Math.min(items.length - 1, Math.floor(this.rng() * items.length))] as T;
  }
}
