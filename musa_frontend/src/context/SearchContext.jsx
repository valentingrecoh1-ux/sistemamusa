import { createContext, useContext, useState } from 'react';

const SearchContext = createContext();

export function SearchProvider({ children }) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);

  const open = () => setIsOpen(true);
  const close = () => { setIsOpen(false); setQuery(''); };

  return (
    <SearchContext.Provider value={{ query, setQuery, isOpen, open, close }}>
      {children}
    </SearchContext.Provider>
  );
}

export const useSearch = () => useContext(SearchContext);
