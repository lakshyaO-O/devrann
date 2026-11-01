export interface PublicProblemPreview {
  id: string;
  title: string;
  difficulty: string;
  category: string;
  description: string;
  examples: Array<{ input: string; output: string; explanation?: string }>;
  starterCode: Record<string, string>;
}

export interface PublicOverview {
  registeredUsers: number;
  publishedProblems: number;
  problems: PublicProblemPreview[];
  leaderboard: Array<{ id: string; username: string; rating: number; wins: number }>;
  contests: Array<{ id: string; title: string; date: string; status: string }>;
}
