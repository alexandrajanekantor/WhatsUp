"use client";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="mx-auto w-full max-w-md px-4 py-20 text-center">
      <h1 className="text-2xl font-bold">Something went sideways</h1>
      <p className="mt-2 text-stone-600">That page hit an error. Give it another go.</p>
      <button onClick={reset} className="mt-6 rounded-xl bg-violet-600 px-5 py-2.5 font-semibold text-white hover:bg-violet-700">
        Try again
      </button>
    </div>
  );
}
