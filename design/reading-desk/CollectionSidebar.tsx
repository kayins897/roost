import { ArrowRight, LibraryBig } from 'lucide-react';
import { BookCover } from './BookCover';
import { COLLECTIONS } from './catalog';
import type { DeskProps } from './types';
import './collections.css';

export function CollectionSidebar({ state, open }: Pick<DeskProps, 'state' | 'open'>) {
  return <aside className="rd-collection-sidebar" aria-label="主题书单侧栏">
    <header>
      <h2><LibraryBig size={16}/>主题书单</h2>
      <button className="rd-icon" aria-label="查看全部主题书单" title="查看全部书单" onClick={() => open({ kind: 'collection' })}><ArrowRight size={16}/></button>
    </header>
    <div className="rd-collection-cards">
      {COLLECTIONS.map(collection => {
        const books = collection.bookIds.flatMap(id => {
          const work = state.works.find(work => work.id === id);
          return work ? [work] : [];
        });
        return <button
          key={collection.id} className="rd-collection-card" data-collection-id={collection.id}
          aria-label={`查看书单《${collection.title}》，${books.length} 本书`}
          onClick={() => open({ kind: 'collection', id: collection.id })}>
          <div className="rd-collection-card-heading"><h3>{collection.title}</h3><span>{books.length} 本</span></div>
          <p>{collection.description}</p>
          <div className="rd-collection-card-bottom">
            <div className="rd-collection-miniatures" aria-hidden="true">
              {books.slice(0, 3).map(work => <BookCover key={work.id} id={work.id} title={work.title} author={work.subtitle}/>)}
            </div>
            <ArrowRight className="rd-collection-arrow" size={18}/>
          </div>
        </button>;
      })}
    </div>
  </aside>;
}
