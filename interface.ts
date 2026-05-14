export type ResolverVerdict = 'AC' | `P${number}` | 'RJ';

export interface ProblemInfo {
  id: string;
  name: string;
  weight: number;
}

export interface TeamInfo {
  id: string;
  name: string;
  avatar?: string;
  institution?: string;
  exclude?: boolean;
}

export interface SubmissionInfo {
  team: string;
  problem: string;
  score: number;
  verdict: ResolverVerdict;
  status: string;
  time: number;
}

export interface ResolverInput {
  name: string;
  duration: number;
  frozen: number;
  problems: ProblemInfo[];
  teams: TeamInfo[];
  submissions: SubmissionInfo[];
}
