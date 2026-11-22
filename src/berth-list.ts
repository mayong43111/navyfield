export function renderBerths(list: HTMLElement, names: readonly string[], selected: number, query: string,
  choose: (index: number) => void): number {
  const doc = list.ownerDocument;
  const fragment = doc.createDocumentFragment();
  const term = query.trim();
  let count = 0;
  names.forEach((name, index) => {
    const number = String(index + 1).padStart(2, '0');
    if (!(`${number}号泊位 ${name}`).includes(term)) return;
    const row = doc.createElement('button');
    row.type = 'button';
    row.dataset['berth'] = String(index);
    row.setAttribute('aria-pressed', String(index === selected));
    const badge = doc.createElement('b');
    badge.textContent = number;
    const vessel = doc.createElement('span');
    vessel.textContent = name;
    row.append(badge, vessel);
    if (index === selected) {
      const active = doc.createElement('small');
      active.textContent = '当前泊位';
      row.append(active);
    }
    row.addEventListener('click', () => choose(index));
    fragment.append(row);
    count++;
  });
  list.replaceChildren(fragment);
  return count;
}
