import type { Metadata } from "next";
import Link from "next/link";
import { UploadForm } from "../../components/UploadForm";
import { IArrowLeft } from "../../components/icons";

export const metadata: Metadata = { title: "Upload URL" };

export default function UploadPage() {
  return (
    <main className="page">
      <Link href="/" className="back-link"><IArrowLeft /> Home</Link>
      <UploadForm />
    </main>
  );
}