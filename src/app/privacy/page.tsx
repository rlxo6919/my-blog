import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "개인정보처리방침",
  description: "뚝딱코딩의 개인정보처리방침",
  alternates: {
    canonical: "/privacy",
  },
  openGraph: {
    title: "개인정보처리방침 | 뚝딱코딩",
    description: "뚝딱코딩의 개인정보처리방침",
    url: "https://ttukttak-coding.vercel.app/privacy",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "개인정보처리방침 | 뚝딱코딩",
    description: "뚝딱코딩의 개인정보처리방침",
  },
};

export default function PrivacyPage() {
  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-3xl font-bold mb-2">개인정보처리방침</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-10">
        최종 수정일: 2026년 4월 6일
      </p>

      <div className="space-y-10 text-gray-700 dark:text-gray-300 leading-relaxed">
        <section>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">
            1. 수집하는 개인정보
          </h2>
          <p>
            본 블로그는 기본적으로 별도의 회원가입 절차 없이 이용 가능하며,
            직접적으로 개인정보를 수집하지 않습니다.
            다만, 아래의 경우 자동으로 정보가 수집될 수 있습니다.
          </p>
          <ul className="list-disc pl-5 mt-3 space-y-1.5 text-sm">
            <li>방문 시 IP 주소, 브라우저 종류, 접속 시간 등 기본적인 접속 정보</li>
            <li>서비스 운영 및 방문 통계 확인을 위한 익명화된 이용 정보</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">
            2. 개인정보의 이용 목적
          </h2>
          <ul className="list-disc pl-5 space-y-1.5 text-sm">
            <li>블로그 이용 통계 분석 및 서비스 개선</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">
            3. 쿠키(Cookie) 사용
          </h2>
          <p>
            본 블로그는 서비스 제공 과정에서 필요한 범위 내에서 쿠키 또는 유사 기술을
            사용할 수 있습니다. 쿠키 사용 여부와 방식은 브라우저 설정에서 제어할 수 있으며,
            일부 기능은 설정에 따라 정상적으로 동작하지 않을 수 있습니다.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">
            4. 방문 통계 분석
          </h2>
          <p>
            본 블로그는 방문 통계 확인과 서비스 개선을 위해 <strong>Vercel Analytics</strong>를
            사용할 수 있습니다. 이 과정에서 페이지 조회, 브라우저, 유입 경로, 국가 수준의
            익명화된 방문 정보가 처리될 수 있습니다.
          </p>
          <ul className="list-disc pl-5 mt-3 space-y-1.5 text-sm">
            <li>
              자세한 내용은{" "}
              <a
                href="https://vercel.com/docs/analytics"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 dark:text-blue-400 underline underline-offset-2"
              >
                Vercel Analytics 문서
              </a>
              를 참고하시기 바랍니다.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">
            5. 댓글 서비스
          </h2>
          <p>
            본 블로그는 Giscus(GitHub Discussions 기반) 댓글 시스템을 사용합니다.
            댓글 작성 시 GitHub 계정을 통해 인증되며, 관련 정보는 GitHub의
            개인정보처리방침에 따라 처리됩니다.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">
            6. 개인정보의 보유 및 파기
          </h2>
          <p>
            서버 로그 및 통계성 데이터는 각 서비스 제공자의 정책과 운영 목적에 따라
            필요한 기간 동안 보관될 수 있으며, 목적 달성 후 더 이상 필요하지 않으면
            삭제되거나 비식별화된 형태로만 유지됩니다.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">
            7. 개인정보처리방침의 변경
          </h2>
          <p>
            본 방침이 변경될 경우, 변경 사항은 본 페이지를 통해 공지됩니다.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">
            8. 문의
          </h2>
          <p>
            개인정보 관련 문의는{" "}
            <a
              href="https://github.com/rlxo6919"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 dark:text-blue-400 underline underline-offset-2"
            >
              GitHub
            </a>
            를 통해 연락해 주시기 바랍니다.
          </p>
        </section>
      </div>

      <div className="mt-12 pt-6 border-t border-gray-200 dark:border-gray-700">
        <Link
          href="/"
          className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 transition-colors"
        >
          &larr; 홈으로 돌아가기
        </Link>
      </div>
    </div>
  );
}
