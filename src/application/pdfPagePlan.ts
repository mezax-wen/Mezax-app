export type PdfPlanInput = {
  id: number;
  name: string;
  pageCount: number;
};

export type PdfPlanEntry = PdfPlanInput & {
  startPage: number;
  endPage: number;
  pageLabel: string;
};

export function createPdfPagePlan(items: PdfPlanInput[], includeCover: boolean): PdfPlanEntry[] {
  let nextPage = includeCover ? 2 : 1;

  return items.map((item) => {
    const pageCount = Math.max(1, Math.floor(item.pageCount) || 1);
    const startPage = nextPage;
    const endPage = startPage + pageCount - 1;
    nextPage = endPage + 1;

    return {
      ...item,
      pageCount,
      startPage,
      endPage,
      pageLabel: startPage === endPage ? String(startPage) : `${startPage}\u2013${endPage}`,
    };
  });
}
