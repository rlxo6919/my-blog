import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "개인정보처리방침",
  description: "뚝딱코딩의 개인정보처리방침",
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
            <li>방문 시 IP 주소, 브라우저 종류, 접속 시간 등 (서버 로그)</li>
            <li>쿠키를 통한 방문 기록 (Google Analytics, 광고 서비스 등 이용 시)</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">
            2. 개인정보의 이용 목적
          </h2>
          <ul className="list-disc pl-5 space-y-1.5 text-sm">
            <li>블로그 이용 통계 분석 및 서비스 개선</li>
            <li>맞춤형 광고 제공 (광고 서비스 이용 시)</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">
            3. 쿠키(Cookie) 사용
          </h2>
          <p>
            본 블로그는 사용자 경험 개선 및 광고 서비스를 위해 쿠키를 사용할 수 있습니다.
            쿠키는 브라우저 설정을 통해 거부할 수 있으며, 거부 시 일부 서비스 이용에
            제한이 있을 수 있습니다.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">
            4. 광고 서비스
          </h2>
          <p>
            본 블로그는 Google AdSense 등 제3자 광고 서비스를 이용할 수 있습니다.
            이러한 광고 서비스 제공업체는 사용자의 관심사에 기반한 광고를 제공하기 위해
            쿠키를 사용할 수 있습니다.
          </p>
          <ul className="list-disc pl-5 mt-3 space-y-1.5 text-sm">
            <li>
              Google의 광고 쿠키 사용에 대한 자세한 내용은{" "}
              <a
                href="https://policies.google.com/technologies/ads"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 dark:text-blue-400 underline underline-offset-2"
              >
                Google 광고 정책
              </a>
              을 참고하시기 바랍니다.
            </li>
            <li>
              사용자는{" "}
              <a
                href="https://www.google.com/settings/ads"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 dark:text-blue-400 underline underline-offset-2"
              >
                Google 광고 설정
              </a>
              에서 맞춤 광고를 비활성화할 수 있습니다.
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
            서버 로그는 일정 기간 후 자동 삭제되며, 그 외 수집된 정보는
            이용 목적이 달성된 후 지체 없이 파기합니다.
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
