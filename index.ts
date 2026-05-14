import {
  avatar,
  ContestModel,
  ContestNotEndedError,
  Context,
  PERM,
  Schema,
  STATUS_SHORT_TEXTS,
  UserModel,
} from 'hydrooj';
import { ResolverInput } from './interface';

export const Config = Schema.object({
  requireEditPerm: Schema.boolean().default(true).description('Require contest edit permission for resolver page'),
});

function clampScore(value: unknown): number {
  const score = Number(value);
  if (!Number.isFinite(score)) return 0;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function toVerdict(score: number): 'AC' | `P${number}` {
  if (score >= 100) return 'AC';
  return `P${score}`;
}

export function apply(ctx: Context, config: ReturnType<typeof Config>) {
  ctx.inject(['scoreboard'], ({ scoreboard }) => {
    scoreboard.addView('ioi-resolver', 'IOI Resolver', { tdoc: 'tdoc' }, {
      async display({ tdoc }) {
        if (!ContestModel.isDone(tdoc)) throw new ContestNotEndedError();
        if (!this.user.own(tdoc)) {
          if (config.requireEditPerm) this.checkPerm(PERM.PERM_EDIT_CONTEST);
          else this.checkPerm(PERM.PERM_VIEW_CONTEST_HIDDEN_SCOREBOARD);
        }

        const teams = await ContestModel.getMultiStatus(tdoc.domainId, { docId: tdoc.docId }).toArray();
        const udict = await UserModel.getList(tdoc.domainId, teams.map((team) => team.uid));
        const unknownSchool = this.translate('Unknown School');
        const pidIndex = new Map<number, string>(tdoc.pids.map((pid, idx) => [pid, String.fromCharCode(65 + idx)]));
        const duration = Math.floor((tdoc.endAt.getTime() - tdoc.beginAt.getTime()) / 1000);
        const lockAt = tdoc.lockAt?.getTime() ?? tdoc.endAt.getTime();
        const frozen = Math.floor((lockAt - tdoc.beginAt.getTime()) / 1000);

        const submissions = teams.flatMap((team) => {
          const journal = (team.journal || [])
            .filter((entry) => tdoc.pids.includes(entry.pid))
            .sort((a, b) => a.rid.getTimestamp().getTime() - b.rid.getTimestamp().getTime());
          return journal.map((entry) => {
            const score = clampScore(entry.score);
            const status = STATUS_SHORT_TEXTS[entry.status] || 'RJ';
            return {
              team: String(team.uid),
              problem: String(entry.pid),
              score,
              verdict: toVerdict(score),
              status,
              time: Math.floor((entry.rid.getTimestamp().getTime() - tdoc.beginAt.getTime()) / 1000),
            };
          });
        });

        this.response.body = {
          payload: {
            name: tdoc.title,
            duration,
            frozen,
            problems: tdoc.pids.map((pid) => ({
              id: String(pid),
              name: pidIndex.get(pid) || String(pid),
              weight: Number(tdoc.score?.[pid] || 100),
            })),
            teams: teams.map((team) => ({
              id: String(team.uid),
              name: udict[team.uid]?.displayName || udict[team.uid]?.uname || `U${team.uid}`,
              avatar: avatar(udict[team.uid]?.avatar),
              institution: udict[team.uid]?.school || unknownSchool,
              exclude: team.unrank,
            })),
            submissions,
          } as ResolverInput,
        };
        this.response.template = 'resolver.html';
      },
      supportedRules: ['ioi', 'strictioi'],
    });
  });
}
