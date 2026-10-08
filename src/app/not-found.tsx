import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto w-full max-w-md px-4 py-20 text-center">
      <h1 className="text-2xl font-bold">Nothing here</h1>
      <p className="mt-2 text-stone-600">We couldn&apos;t find that page.</p>
      <Link href="/" className="mt-6 inline-block rounded-xl bg-violet-600 px-5 py-2.5 font-semibold text-white hover:bg-violet-700">
        Find something to do
      </Link>
    </div>
  );
}
