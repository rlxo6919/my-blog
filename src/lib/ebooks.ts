export type EbookTheme = {
  accent: string;
  coverGlow: string;
  badgeBg: string;
  badgeText: string;
  chipBg: string;
  chipText: string;
  button: string;
  ogBg: string;
  ogAccent: string;
};

export type Ebook = {
  id: string;
  title: string;
  subtitle: string;
  cover: string;
  pdf: string;
  downloadName: string;
  pages: number;
  chapters: number;
  sizeMB: string;
  theme: EbookTheme;
  description: string;
  toc: { part: string; chapters: string[] }[];
};

export const EBOOKS: Ebook[] = [
  {
    id: "concurrency-10",
    title: "동시성·트랜잭션 10강",
    subtitle: "ACID · 격리 수준 · MVCC · 락 · 멱등성",
    cover: "/ebook/cover-concurrency-10.png",
    pdf: "/ebook/backend-cs-concurrency-10.pdf",
    downloadName: "백엔드-동시성-트랜잭션-10강.pdf",
    pages: 175,
    chapters: 10,
    sizeMB: "5.4MB",
    theme: {
      accent: "amber",
      coverGlow: "from-amber-300/40 to-orange-500/40",
      badgeBg: "bg-amber-100/80 dark:bg-amber-900/40 backdrop-blur",
      badgeText: "text-amber-700 dark:text-amber-300",
      chipBg: "bg-amber-50 dark:bg-amber-950/40 border-amber-200/60 dark:border-amber-800/40",
      chipText: "text-amber-800 dark:text-amber-200",
      button:
        "bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 shadow-amber-500/30",
      ogBg: "linear-gradient(135deg, #fffbeb 0%, #fef3c7 50%, #fed7aa 100%)",
      ogAccent: "#d97706",
    },
    description:
      "트랜잭션과 동시성 제어를 한 권에 모았습니다. 락 경합·팬텀 리드·중복 결제 같은 실무 사고의 원인과 도구를 정리합니다.",
    toc: [
      { part: "트랜잭션 기초", chapters: ["ACID", "격리 수준", "Dirty / Phantom Read"] },
      { part: "동시성 제어 메커니즘", chapters: ["MVCC", "락 기본", "2PL"] },
      { part: "락과 멱등성 실무", chapters: ["FOR UPDATE", "낙관 vs 비관", "분산 락", "멱등성"] },
    ],
  },
  {
    id: "query-12",
    title: "DB·쿼리 최적화 12강",
    subtitle: "정규화 · 인덱스 · 실행 계획 · 캐시 · 파티셔닝 · 샤딩",
    cover: "/ebook/cover-query-12.png",
    pdf: "/ebook/backend-cs-query-12.pdf",
    downloadName: "백엔드-DB-쿼리최적화-12강.pdf",
    pages: 221,
    chapters: 12,
    sizeMB: "6.6MB",
    theme: {
      accent: "blue",
      coverGlow: "from-blue-400/40 to-indigo-500/40",
      badgeBg: "bg-blue-100/80 dark:bg-blue-900/40 backdrop-blur",
      badgeText: "text-blue-700 dark:text-blue-300",
      chipBg: "bg-blue-50 dark:bg-blue-950/40 border-blue-200/60 dark:border-blue-800/40",
      chipText: "text-blue-800 dark:text-blue-200",
      button:
        "bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600 shadow-blue-500/30",
      ogBg: "linear-gradient(135deg, #eff6ff 0%, #dbeafe 50%, #e0e7ff 100%)",
      ogAccent: "#4f46e5",
    },
    description:
      "조회를 느리게 만드는 원인과 구조적 해결책, 그리고 테이블이 한 노드를 넘어설 때 쓰는 확장 전략까지. 쿼리 한 줄 튜닝이 아니라 패턴이 반복될 때 적용 가능한 사고 틀을 만듭니다.",
    toc: [
      { part: "데이터베이스 설계 기초", chapters: ["정규화", "반정규화"] },
      { part: "인덱스와 실행 계획", chapters: ["인덱스 튜닝", "인덱스가 안 타는 이유", "EXPLAIN"] },
      {
        part: "조회 성능",
        chapters: ["커넥션 풀", "N+1", "캐시 전략", "캐시 스탬피드", "페이지네이션"],
      },
      { part: "확장 전략", chapters: ["파티셔닝", "샤딩"] },
    ],
  },
  {
    id: "network-7",
    title: "네트워크 7강",
    subtitle: "OSI · TCP/UDP · HTTP · TLS · DNS",
    cover: "/ebook/cover-network-7.png",
    pdf: "/ebook/backend-cs-network-7.pdf",
    downloadName: "백엔드-네트워크-7강.pdf",
    pages: 133,
    chapters: 7,
    sizeMB: "4.7MB",
    theme: {
      accent: "emerald",
      coverGlow: "from-emerald-300/40 to-teal-500/40",
      badgeBg: "bg-emerald-100/80 dark:bg-emerald-900/40 backdrop-blur",
      badgeText: "text-emerald-700 dark:text-emerald-300",
      chipBg:
        "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200/60 dark:border-emerald-800/40",
      chipText: "text-emerald-800 dark:text-emerald-200",
      button:
        "bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 shadow-emerald-500/30",
      ogBg: "linear-gradient(135deg, #ecfdf5 0%, #d1fae5 50%, #ccfbf1 100%)",
      ogAccent: "#047857",
    },
    description:
      "백엔드 개발자가 알아야 할 네트워크 기초. OSI에서 시작해 TCP·HTTP·TLS·DNS까지, 요청 한 번이 흘러가는 길을 그릴 수 있게 만드는 게 목표입니다.",
    toc: [
      {
        part: "네트워크 기초",
        chapters: ["OSI / TCP/IP", "IPv4 vs IPv6", "TCP vs UDP", "TCP 4-way"],
      },
      { part: "HTTP와 보안", chapters: ["HTTP/1·2·3", "HTTPS · TLS", "DNS"] },
    ],
  },
];

export function getEbookById(id: string): Ebook | undefined {
  return EBOOKS.find((b) => b.id === id);
}

export const EBOOK_TOTAL_PAGES = EBOOKS.reduce((s, b) => s + b.pages, 0);
export const EBOOK_TOTAL_CHAPTERS = EBOOKS.reduce((s, b) => s + b.chapters, 0);
