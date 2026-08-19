export default function ModulePlaceholderPage({ params }: { params: { module: string } }) {
  return (
    <div className="card flex flex-col items-center justify-center gap-2 py-20 text-center">
      <p className="text-4xl">🚧</p>
      <p className="text-lg font-semibold text-white">Module à venir</p>
      <p className="text-sm text-gray-500">« {params.module} » arrive bientôt — on le fait module par module.</p>
    </div>
  );
}
