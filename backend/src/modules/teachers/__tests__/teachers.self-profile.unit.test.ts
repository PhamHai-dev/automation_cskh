jest.mock('../teachers.repository', () => ({
  TeachersRepository: jest.fn(),
}));

import { TeachersRepository } from '../teachers.repository';
import { TeachersService } from '../teachers.service';

const RepositoryMock = TeachersRepository as jest.MockedClass<typeof TeachersRepository>;

describe('TeachersService self profile', () => {
  const repository = {
    findByUserId: jest.fn(),
    updateMyContact: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    RepositoryMock.mockImplementation(() => repository as any);
  });

  it('returns only the profile linked to the authenticated user', async () => {
    repository.findByUserId.mockResolvedValue({ id: 9, user_id: 42, name: 'Sensei A' });
    const service = new TeachersService();

    await expect(service.getMyProfile(42)).resolves.toMatchObject({ id: 9, user_id: 42 });
    expect(repository.findByUserId).toHaveBeenCalledWith(42);
  });

  it('updates only contact fields on the linked teacher and keeps an audit snapshot', async () => {
    repository.findByUserId.mockResolvedValue({
      id: 9,
      user_id: 42,
      phone: '0901',
      email: 'old@example.com',
    });
    repository.updateMyContact.mockResolvedValue({
      id: 9,
      phone: '0902',
      email: 'new@example.com',
    });
    const service = new TeachersService();

    await service.updateMyProfile(42, { phone: '0902', email: 'new@example.com' });

    expect(repository.updateMyContact).toHaveBeenCalledWith(
      9,
      42,
      { phone: '0902', email: 'new@example.com' },
      { phone: '0901', email: 'old@example.com' },
    );
  });

  it('rejects accounts without a linked teacher profile', async () => {
    repository.findByUserId.mockResolvedValue(null);
    const service = new TeachersService();

    await expect(service.getMyProfile(42)).rejects.toMatchObject({ status: 404 });
    await expect(service.updateMyProfile(42, { phone: '0902' })).rejects.toMatchObject({
      status: 404,
    });
  });
});
