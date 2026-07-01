import { notFound } from 'next/navigation';
import { getBook } from '@/lib/books';
import ReaderView from '@/components/reader/ReaderView';

export default async function BookPage({ params }) {
  const { id } = await params;
  const book = await getBook(id);
  if (!book) notFound();
  return <ReaderView book={book} key={book.id} />;
}
