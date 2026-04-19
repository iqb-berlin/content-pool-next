import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ViewsService } from './views.service';
import { Acp, AcpAccessConfig, AcpFile, AppSettings, AcpItemPreference } from '../database/entities';

describe('ViewsService', () => {
  let service: ViewsService;
  let acpRepository: { findOne: jest.Mock };
  let accessConfigRepository: { findOne: jest.Mock; find: jest.Mock };
  let fileRepository: { find: jest.Mock; findOne: jest.Mock };
  let settingsRepository: { findOne: jest.Mock };
  let itemPreferenceRepository: { findOne: jest.Mock; create: jest.Mock; save: jest.Mock };

  beforeEach(async () => {
    acpRepository = { findOne: jest.fn() };
    accessConfigRepository = { findOne: jest.fn(), find: jest.fn() };
    fileRepository = { find: jest.fn(), findOne: jest.fn() };
    settingsRepository = { findOne: jest.fn() };
    itemPreferenceRepository = {
      findOne: jest.fn(),
      create: jest.fn().mockImplementation((value) => value),
      save: jest.fn().mockImplementation(async (value) => value),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ViewsService,
        { provide: getRepositoryToken(Acp), useValue: acpRepository },
        { provide: getRepositoryToken(AcpAccessConfig), useValue: accessConfigRepository },
        { provide: getRepositoryToken(AcpFile), useValue: fileRepository },
        { provide: getRepositoryToken(AppSettings), useValue: settingsRepository },
        { provide: getRepositoryToken(AcpItemPreference), useValue: itemPreferenceRepository },
      ],
    }).compile();

    service = module.get<ViewsService>(ViewsService);
  });

  it('uses bookletModule IDs as sequence IDs on ACP start page', async () => {
    acpRepository.findOne.mockResolvedValue({
      id: 'acp-1',
      name: 'ACP',
      description: 'Demo',
      acpIndex: {
        assessmentParts: [
          {
            units: [{ id: 'unit-1', name: 'Unit 1' }],
            bookletModules: [
              {
                id: 'mod-1',
                name: [{ lang: 'de', value: 'Modul 1' }],
                units: [{ id: 'unit-1', order: 1 }],
              },
            ],
            instruments: [
              {
                id: 'inst-1',
                name: 'Instrument 1',
                testcenterBooklet: [
                  {
                    definitionId: 'booklet-1.xml',
                    modules: [{ moduleId: 'mod-1' }],
                  },
                ],
              },
            ],
          },
        ],
      },
    });
    accessConfigRepository.findOne.mockResolvedValue({ featureConfig: {} });

    const start = await service.getAcpStartPage('acp-1');
    expect(start.sequences).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'mod-1',
          bookletDefinitionId: 'booklet-1.xml',
          instrumentName: 'Instrument 1',
        }),
      ]),
    );
  });

  it('supports different module reference formats and deduplicates sequence IDs', async () => {
    acpRepository.findOne.mockResolvedValue({
      id: 'acp-1',
      name: 'ACP',
      description: 'Demo',
      acpIndex: {
        assessmentParts: [
          {
            units: [{ id: 'unit-1', name: 'Unit 1' }],
            bookletModules: [
              {
                id: 'mod-1',
                name: 'Module 1',
                units: [{ id: 'unit-1', order: 1 }],
              },
              {
                id: 'mod-2',
                name: 'Module 2',
                units: [{ id: 'unit-1', order: 1 }],
              },
            ],
            instruments: [
              {
                id: 'inst-1',
                name: 'Instrument 1',
                testcenterBooklet: [
                  {
                    definitionId: 'booklet-1.xml',
                    modules: [{ moduleId: 'mod-1' }, { id: 'mod-2' }, 'mod-1'],
                  },
                ],
              },
            ],
          },
        ],
      },
    });
    accessConfigRepository.findOne.mockResolvedValue({ featureConfig: {} });

    const start = await service.getAcpStartPage('acp-1');
    const sequenceIds = (start.sequences || []).map((s: { id: string }) => s.id);

    expect(sequenceIds.filter((id: string) => id === 'mod-1')).toHaveLength(1);
    expect(sequenceIds).toEqual(expect.arrayContaining(['mod-1', 'mod-2']));
  });

  it('exposes canonical metadataColumns when legacy key is stored', async () => {
    acpRepository.findOne.mockResolvedValue({
      id: 'acp-1',
      name: 'ACP',
      description: 'Demo',
      acpIndex: {
        assessmentParts: [],
      },
    });
    accessConfigRepository.findOne.mockResolvedValue({
      featureConfig: {
        itemListMetadataColumns: ['metaA', 'metaB'],
      },
    });

    const start = await service.getAcpStartPage('acp-1');
    expect(start.featureConfig).toMatchObject({
      metadataColumns: {
        visible: ['metaA', 'metaB'],
        order: ['metaA', 'metaB'],
      },
    });
    expect(start.featureConfig.itemListMetadataColumns).toBeUndefined();
  });

  it('returns empty item preferences when no authenticated identity is available', async () => {
    const prefs = await service.getItemPreferences('acp-1', null, 'item-list');
    expect(prefs).toEqual({ ui: {}, tags: {} });
    expect(itemPreferenceRepository.findOne).not.toHaveBeenCalled();
  });

  it('loads normalized item preferences for authenticated users', async () => {
    itemPreferenceRepository.findOne.mockResolvedValue({
      preferences: {
        ui: {
          filterText: 'abc',
          sortDir: 'asc',
        },
        tags: {
          item1: ['alpha', 'alpha', ' beta '],
          item2: [],
        },
      },
    });

    const prefs = await service.getItemPreferences('acp-1', { sub: 'user-1', type: 'user' }, 'item-list');
    expect(prefs).toEqual({
      ui: {
        filterText: 'abc',
        sortDir: 'asc',
      },
      tags: {
        item1: ['alpha', 'beta'],
      },
    });
  });

  it('saves preferences scoped by credential username', async () => {
    itemPreferenceRepository.findOne.mockResolvedValue(null);

    const saved = await service.saveItemPreferences(
      'acp-1',
      { type: 'credential', username: 'reader-a' },
      {
        ui: {
          filterText: 'xyz',
        },
        tags: {
          item1: ['tag1', 'tag1', 'tag2'],
        },
      },
      'item-explorer',
    );

    expect(saved).toEqual({
      ui: {
        filterText: 'xyz',
      },
      tags: {
        item1: ['tag1', 'tag2'],
      },
    });
    expect(itemPreferenceRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        acpId: 'acp-1',
        viewId: 'item-explorer',
        userId: null,
        credentialUsername: 'reader-a',
      }),
    );
  });

  it('returns default public settings when app settings are missing', async () => {
    settingsRepository.findOne.mockResolvedValue(null);

    await expect(service.getPublicSettings()).resolves.toEqual({
      theme: {},
      language: 'de',
      logoUrl: null,
      landingPageHtml: null,
      imprintHtml: null,
      privacyHtml: null,
      accessibilityHtml: null,
    });
  });

  it('returns configured public settings', async () => {
    settingsRepository.findOne.mockResolvedValue({
      theme: { primary: '#fff' },
      language: 'en',
      logoUrl: '/logo.svg',
      landingPageHtml: '<p>Landing</p>',
      imprintHtml: '<p>Imprint</p>',
      privacyHtml: '<p>Privacy</p>',
      accessibilityHtml: '<p>A11y</p>',
    });

    await expect(service.getPublicSettings()).resolves.toEqual({
      theme: { primary: '#fff' },
      language: 'en',
      logoUrl: '/logo.svg',
      landingPageHtml: '<p>Landing</p>',
      imprintHtml: '<p>Imprint</p>',
      privacyHtml: '<p>Privacy</p>',
      accessibilityHtml: '<p>A11y</p>',
    });
  });

  it('aggregates public ACPs and active credential ACPs without duplicates', async () => {
    accessConfigRepository.find
      .mockResolvedValueOnce([
        {
          acpId: 'acp-public',
          accessModel: 'PUBLIC',
          acp: { id: 'acp-public', name: 'Public', description: 'Public Desc' },
        },
      ])
      .mockResolvedValueOnce([
        {
          acpId: 'acp-public',
          accessModel: 'CREDENTIALS_LIST',
          validFrom: null,
          validUntil: null,
          acp: { id: 'acp-public', name: 'Public', description: 'Public Desc' },
        },
        {
          acpId: 'acp-credential',
          accessModel: 'CREDENTIALS_LIST',
          validFrom: new Date('2026-01-01T00:00:00.000Z'),
          validUntil: new Date('2026-12-31T23:59:59.000Z'),
          acp: { id: 'acp-credential', name: 'Credential', description: 'Credential Desc' },
        },
        {
          acpId: 'acp-inactive',
          accessModel: 'CREDENTIALS_LIST',
          validFrom: new Date('2027-01-01T00:00:00.000Z'),
          validUntil: new Date('2027-12-31T23:59:59.000Z'),
          acp: { id: 'acp-inactive', name: 'Inactive', description: 'Inactive Desc' },
        },
      ]);

    const result = await service.getPublicAcps();

    expect(result).toEqual([
      {
        id: 'acp-public',
        name: 'Public',
        description: 'Public Desc',
        accessModel: 'PUBLIC',
      },
      {
        id: 'acp-credential',
        name: 'Credential',
        description: 'Credential Desc',
        accessModel: 'CREDENTIALS_LIST',
        requiresLogin: true,
      },
    ]);
  });

  it('returns null for unknown ACPs in start page/index/unit/sequence lookups', async () => {
    acpRepository.findOne.mockResolvedValue(null);

    await expect(service.getAcpStartPage('missing')).resolves.toBeNull();
    await expect(service.getAcpIndex('missing')).resolves.toBeNull();
    await expect(service.getUnitViewData('missing', 'unit-1')).resolves.toBeNull();
    await expect(service.getTaskSequence('missing', 'seq-1')).resolves.toBeNull();
  });

  it('loads unit view data with resolved dependencies', async () => {
    acpRepository.findOne.mockResolvedValue({
      id: 'acp-1',
      acpIndex: {
        assessmentParts: [
          {
            units: [
              {
                id: 'unit-1',
                name: 'Unit 1',
                description: 'Desc',
                lang: 'de',
                items: [{ id: 'item-1' }],
                dependencies: [{ id: 'player.html', type: 'PLAYER' }, { id: 'missing.html', type: 'PLAYER' }],
                codingScheme: {},
                richText: '<p>x</p>',
              },
            ],
          },
        ],
      },
    });
    fileRepository.findOne
      .mockResolvedValueOnce({
        id: 'file-1',
        originalName: 'player.html',
      })
      .mockResolvedValueOnce(null);

    await expect(service.getUnitViewData('acp-1', 'unit-1')).resolves.toEqual({
      id: 'unit-1',
      name: 'Unit 1',
      description: 'Desc',
      lang: 'de',
      items: [{ id: 'item-1' }],
      dependencies: [
        {
          type: 'PLAYER',
          originalName: 'player.html',
          downloadUrl: '/api/acp/acp-1/files/file-1/download',
          fileId: 'file-1',
        },
      ],
      codingScheme: {},
      richText: '<p>x</p>',
    });
  });

  it('returns null for unknown units and computes item list prefixes', async () => {
    acpRepository.findOne
      .mockResolvedValueOnce({
        id: 'acp-1',
        acpIndex: {
          assessmentParts: [{ units: [{ id: 'unit-1', items: [] }] }],
        },
      })
      .mockResolvedValueOnce({
        id: 'acp-1',
        acpIndex: {
          assessmentParts: [
            {
              units: [
                {
                  id: 'unit-1',
                  name: 'Unit 1',
                  items: [{ id: 'item-1', name: 'Item 1' }, { id: 'item-2', useUnitAliasAsPrefix: false }],
                },
              ],
            },
          ],
        },
      });

    await expect(service.getUnitViewData('acp-1', 'missing-unit')).resolves.toBeNull();
    await expect(service.getItemList('acp-1')).resolves.toEqual([
      {
        itemId: 'unit-1_item-1',
        unitId: 'unit-1',
        unitName: 'Unit 1',
        name: 'Item 1',
        sourceVariable: undefined,
      },
      {
        itemId: 'item-2',
        unitId: 'unit-1',
        unitName: 'Unit 1',
        name: undefined,
        sourceVariable: undefined,
      },
    ]);
  });

  it('returns empty item list when ACP does not exist', async () => {
    acpRepository.findOne.mockResolvedValue(null);
    await expect(service.getItemList('missing')).resolves.toEqual([]);
  });

  it('returns sorted sequence units and falls back to raw ids when units are missing', async () => {
    acpRepository.findOne.mockResolvedValue({
      id: 'acp-1',
      acpIndex: {
        assessmentParts: [
          {
            units: [{ id: 'unit-1', name: 'Unit 1' }],
            bookletModules: [
              {
                id: 'seq-1',
                name: 'Sequence',
                units: [{ id: 'missing-unit', order: 2 }, { id: 'unit-1', order: 1 }],
              },
            ],
          },
        ],
      },
    });

    await expect(service.getTaskSequence('acp-1', 'seq-1')).resolves.toEqual({
      id: 'seq-1',
      name: 'Sequence',
      units: [
        { id: 'unit-1', name: 'Unit 1' },
        { id: 'missing-unit', name: 'missing-unit' },
      ],
    });
    await expect(service.getTaskSequence('acp-1', 'unknown')).resolves.toBeNull();
  });

  it('returns normalized preferences immediately when identity is missing on save', async () => {
    await expect(
      service.saveItemPreferences(
        'acp-1',
        null,
        {
          ui: { filterText: 'abc' },
          tags: { item1: ['x', ' x ', ''] },
        },
      ),
    ).resolves.toEqual({
      ui: { filterText: 'abc' },
      tags: { item1: ['x'] },
    });
    expect(itemPreferenceRepository.save).not.toHaveBeenCalled();
  });

  it('updates existing preference records for authenticated users', async () => {
    itemPreferenceRepository.findOne.mockResolvedValue({
      id: 'pref-1',
      acpId: 'acp-1',
      viewId: 'item-list',
      userId: 'user-1',
      preferences: {},
    });

    await service.saveItemPreferences(
      'acp-1',
      { sub: 'user-1', type: 'oidc' },
      {
        ui: { sortBy: 'name' },
        tags: { itemA: ['A', 'A', ' B '] },
      },
      'item-list',
    );

    expect(itemPreferenceRepository.create).not.toHaveBeenCalled();
    expect(itemPreferenceRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'pref-1',
        preferences: {
          ui: { sortBy: 'name' },
          tags: { itemA: ['A', 'B'] },
        },
      }),
    );
  });
});
