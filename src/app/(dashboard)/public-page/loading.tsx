import { PageContainer } from "@/components/layout/page-container";
import { Spinner } from "@/components/ui/spinner";

export default function PublicPageLoading() {
  return (
    <PageContainer>
      <div className="flex items-center justify-center py-12">
        <Spinner />
      </div>
    </PageContainer>
  );
}
