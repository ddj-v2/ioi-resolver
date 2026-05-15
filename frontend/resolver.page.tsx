import {
  addPage,
  NamedPage,
  React,
  ReactDOM,
} from '@hydrooj/ui-default';
import { animated, easings, useSprings } from '@react-spring/web';
import useKey from 'react-use/lib/useKey';
import { ResolverInput } from '../interface';

const SKIP_STATUS = new Set(['CE', 'SE', 'FE', 'IGN']);

type TeamState = {
  id: string;
  rank: number;
  score: number;
  ranked: boolean;
  problems: ProblemState[];
};

type ProblemState = {
  id: string;
  label: string;
  weight: number;
  oldScore: number;
  frozenBestScore: number;
  oldSubmissions: number;
  frozenSubmissions: number;
};

type RevealOperation = {
  teamId: string;
  problemId: string;
};

type DisplaySettings = {
  showAvatar: boolean;
  showSchool: boolean;
};

interface MainProps extends DisplaySettings {
  data: ResolverInput;
}

function status(problem: ProblemState): 'ac' | 'frozen' | 'partial' | 'failed' | 'untouched' {
  if (problem.oldScore >= 100) return 'ac';
  if (problem.frozenSubmissions > 0) return 'frozen';
  if (problem.oldSubmissions > 0 && problem.oldScore > 0) return 'partial';
  if (problem.oldSubmissions > 0) return 'failed';
  return 'untouched';
}

function scoreText(problem: ProblemState): string {
  const st = status(problem);
  if (st === 'ac') return '100';
  if (st === 'frozen') return `${problem.oldScore}+[${problem.frozenSubmissions}]`;
  if (st === 'partial' || st === 'failed') return `${problem.oldScore}`;
  return problem.label;
}

function weighted(problem: ProblemState): number {
  return (problem.oldScore * problem.weight) / 100;
}

function recalcTeamScore(team: TeamState): void {
  team.score = Math.round(team.problems.reduce((sum, problem) => sum + weighted(problem), 0));
}

function rankTeams(teams: TeamState[]): number[] {
  teams.forEach(recalcTeamScore);
  const sorted = [...teams]
    .map((team, index) => ({ team, index }))
    .sort((a, b) => {
      if (b.team.score !== a.team.score) return b.team.score - a.team.score;
      return a.team.id.localeCompare(b.team.id);
    });
  let shownRank = 1;
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i].team.ranked) {
      sorted[i].team.rank = shownRank;
      shownRank += 1;
    } else {
      sorted[i].team.rank = -1;
    }
  }
  return sorted.map((item) => item.index);
}

function buildStates(data: ResolverInput): TeamState[] {
  const teamMap = new Map<string, TeamState>();
  for (const team of data.teams) {
    teamMap.set(team.id, {
      id: team.id,
      rank: 0,
      score: 0,
      ranked: !team.exclude,
      problems: data.problems.map((problem) => ({
        id: problem.id,
        label: problem.name,
        weight: problem.weight,
        oldScore: 0,
        frozenBestScore: 0,
        oldSubmissions: 0,
        frozenSubmissions: 0,
      })),
    });
  }

  const submissions = [...data.submissions]
    .filter((submission) => !SKIP_STATUS.has(submission.status))
    .sort((a, b) => a.time - b.time);

  for (const submission of submissions) {
    const team = teamMap.get(submission.team);
    if (!team) continue;
    const problem = team.problems.find((item) => item.id === submission.problem);
    if (!problem) continue;

    if (submission.time > data.frozen) {
      problem.frozenSubmissions += 1;
      if (submission.score > problem.frozenBestScore) {
        problem.frozenBestScore = submission.score;
      }
    } else {
      problem.oldSubmissions += 1;
      if (submission.score > problem.oldScore) {
        problem.oldScore = submission.score;
      }
    }
  }

  const teams = [...teamMap.values()];
  rankTeams(teams);
  return teams;
}

function cloneTeams(teams: TeamState[]): TeamState[] {
  return JSON.parse(JSON.stringify(teams)) as TeamState[];
}

function getNextRevealable(team: TeamState): ProblemState | undefined {
  return team.problems.find((problem) => problem.frozenSubmissions > 0);
}

function applyReveal(teams: TeamState[], operation: RevealOperation): void {
  const team = teams.find((item) => item.id === operation.teamId);
  if (!team) return;
  const problem = team.problems.find((item) => item.id === operation.problemId);
  if (!problem) return;

  const oldWeighted = weighted(problem);
  problem.oldSubmissions += problem.frozenSubmissions;
  if (problem.frozenBestScore > problem.oldScore) {
    problem.oldScore = problem.frozenBestScore;
  }
  problem.frozenSubmissions = 0;
  problem.frozenBestScore = 0;

  // IOI partial scores are accumulated as score delta on each reveal.
  const delta = Math.round(weighted(problem) - oldWeighted);
  team.score += delta;
}

function operationsFor(teams: TeamState[]): RevealOperation[] {
  const sandbox = cloneTeams(teams);
  let order = rankTeams(sandbox);
  const operations: RevealOperation[] = [];

  for (let visualRank = order.length - 1; visualRank >= 0; visualRank--) {
    const teamIndex = order[visualRank];
    const team = sandbox[teamIndex];
    while (team) {
      const next = getNextRevealable(team);
      if (!next) break;

      operations.push({ teamId: team.id, problemId: next.id });
      applyReveal(sandbox, { teamId: team.id, problemId: next.id });

      const nextOrder = rankTeams(sandbox);
      if (JSON.stringify(order) !== JSON.stringify(nextOrder)) {
        order = nextOrder;
        visualRank += 1;
        break;
      }
    }
  }

  return operations;
}

async function scrollTo(offset: number): Promise<void> {
  const target = Math.max(0, Math.round(offset));
  await new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.removeEventListener('scroll', onScroll);
      window.clearTimeout(timerId);
      resolve();
    };

    const onScroll = () => {
      if (Math.round(window.pageYOffset) === target) {
        finish();
      }
    };

    const timerId = window.setTimeout(finish, 1200);
    window.addEventListener('scroll', onScroll);
    window.scrollTo({
      top: target,
      behavior: 'smooth',
    });
    window.requestAnimationFrame(onScroll);
    window.requestAnimationFrame(() => window.requestAnimationFrame(onScroll));
  });
}

function start(data: ResolverInput, options: DisplaySettings): void {
  document.title = `${data.name} - IOI Resolver`;
  const title = document.querySelector('.header .title');
  if (title) title.textContent = data.name;

  console.log('IOI Resolver start', data.name, 'teams', data.teams.length, 'problems', data.problems.length);
  // Global keydown listener as an early fallback to ensure key events are captured
  window.addEventListener('keydown', (e) => {
    const k = (e as KeyboardEvent).key;
    if (k === 'ArrowRight' || k === 'n' || k === 'N' || (e as KeyboardEvent).code === 'Space' || k === ' ') {
      console.log('global keydown (startup listener) detected key:', k, (e as KeyboardEvent).code);
    }
  });

  function MainList(props: MainProps) {
    const teams = React.useMemo(() => buildStates(props.data), [props.data]);
    const ops = React.useMemo(() => operationsFor(teams), [teams]);
    console.log('MainList mounted', 'teamsLen', teams.length, 'opsLen', ops.length);

    const [selectedTeam, setSelectedTeam] = React.useState('');
    const [selectedProblem, setSelectedProblem] = React.useState<string | null>(null);
    const [opIndex, setOpIndex] = React.useState(0);
    const [, setRenderToken] = React.useState(0);

    const orderRef = React.useRef(rankTeams(teams));

    const [springs, api] = useSprings(teams.length, (index) => ({
      y: orderRef.current.indexOf(index) * 86 - index * 86,
      zIndex: 0,
      immediate: (key: string) => key === 'y' || key === 'zIndex',
    }));

    async function updateRankAnimation() {
      console.log('updateRankAnimation: computing new order');
      orderRef.current = rankTeams(teams);
      console.log('updateRankAnimation: new order', orderRef.current);
      api.start((index) => {
        const y = orderRef.current.indexOf(index) * 86 - index * 86;
        console.log('updateRankAnimation: spring index', index, 'y', y);
        return {
          y,
          zIndex: 0,
          config: {
            easing: easings.steps(5),
          },
        };
      });
    }

    const runningRef = React.useRef(false);

    async function runNext() {
      if (runningRef.current) {
        console.log('runNext ignored because another run is in progress');
        return;
      }
      runningRef.current = true;
      try {
        console.log('runNext start opIndex', opIndex, 'opsLen', ops.length, 'teamsLen', teams.length, 'order', orderRef.current);
        const op = ops[opIndex];
        if (!op) {
          console.log('runNext: no op at index', opIndex);
          return;
        }

        const position = orderRef.current.indexOf(teams.findIndex((team) => team.id === op.teamId));
        await scrollTo(position * 86 - window.innerHeight + 270);
        setSelectedTeam(op.teamId);
        setSelectedProblem(op.problemId);

        await new Promise((resolve) => setTimeout(resolve, 700));
        applyReveal(teams, op);
        setSelectedProblem(null);

        const before = JSON.stringify(orderRef.current);
        const afterOrder = rankTeams(teams);
        const after = JSON.stringify(afterOrder);
        console.log('runNext: beforeOrder', orderRef.current);
        console.log('runNext: afterOrder', afterOrder);
        if (before !== after) {
          console.log('runNext: order changed — updating animation');
          await updateRankAnimation();
        } else {
          console.log('runNext: order unchanged');
        }

        setOpIndex((value) => value + 1);
        setRenderToken((value) => value + 1);
      } finally {
        runningRef.current = false;
      }
    }

    useKey(
      (event) => event.key === 'ArrowRight' || event.key === 'n' || event.key === 'N' || event.code === 'Space' || event.key === ' ',
      (event) => {
        console.log('useKey detected key:', event.key, event.code);
        runNext();
      },
      {},
      [opIndex, ops],
    );

    // Fallback listener: ensure keydown triggers even if useKey doesn't fire
    React.useEffect(() => {
      const handler = (event: KeyboardEvent) => {
        const k = event.key;
        if (k === 'ArrowRight' || k === 'n' || k === 'N' || event.code === 'Space' || k === ' ') {
          console.log('window.keydown detected key:', k, event.code, 'opIndex', opIndex, 'opsLen', ops.length);
          runNext();
        }
      };
      window.addEventListener('keydown', handler);
      return () => window.removeEventListener('keydown', handler);
    }, [opIndex, ops]);

    return (
      <>
        {teams.map((team, teamIndex) => {
          const teamInfo = data.teams.find((item) => item.id === team.id);
          const spring = springs[teamIndex];
          if (!teamInfo || !spring) return null;

          return (
            <animated.div
              key={team.id}
              className="rank-list-item"
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                top: `${teamIndex * 86}px`,
                transform: spring.y.to((v: number) => `translateY(${v}px)`),
                zIndex: spring.zIndex,
                background: selectedTeam === team.id ? '#2f5f86' : 'transparent',
              }}
            >
              <div className="rank">{team.rank === -1 ? '⭐' : team.rank}</div>
              {props.showAvatar ? <img className="avatar" src={teamInfo.avatar} /> : null}
              <div className="content">
                <div className="name">
                  {props.showSchool ? `${teamInfo.institution} - ` : ''}
                  {teamInfo.name}
                </div>
                <div className="problems">
                  {data.problems.map((problemInfo) => {
                    const problem = team.problems.find((item) => item.id === problemInfo.id);
                    if (!problem) return null;
                    const isSelected = selectedTeam === team.id && selectedProblem === problem.id;
                    return (
                      <span
                        key={problem.id}
                        className={`${status(problem)} ${isSelected ? 'uncover' : ''} item`}
                      >
                        {scoreText(problem)}
                      </span>
                    );
                  })}
                </div>
              </div>
              <div className="score">{team.score}</div>
            </animated.div>
          );
        })}
      </>
    );
  }

  ReactDOM.createRoot(document.getElementById('rank-list')!).render(
    <MainList
      data={data}
      showAvatar={options.showAvatar}
      showSchool={options.showSchool}
    />,
  );
}

addPage(
  new NamedPage(['resolver'], () => {
    start(UiContext.payload, {
      showAvatar: true,
      showSchool: true,
    });
  }),
);
